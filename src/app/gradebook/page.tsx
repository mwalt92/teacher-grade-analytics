import Link from "next/link";
import { redirect } from "next/navigation";
import { getSectionGradebook, getSectionGradingPeriods } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import styles from "./gradebook.module.css";

function formatPercent(value:number|null,digits=2){return value===null?"—":`${value.toFixed(digits)}%`;}
type GradebookPageProps={searchParams:Promise<{period?:string}>};

export default async function GradebookPage({searchParams}:GradebookPageProps){
 const supabase=await createClient();
 const {data:claimsData,error:claimsError}=await supabase.auth.getClaims();
 const userId=claimsData?.claims?.sub;
 if(claimsError||typeof userId!=="string")redirect("/login");
 const sections=await getTeacherSections();
 const section=sections[0];
 if(!section)return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;
 const [roster,periods,params]=await Promise.all([getSectionRoster(section.sectionId,"active"),getSectionGradingPeriods(section.sectionId),searchParams]);
 const selectablePeriods=periods.filter(period=>/^(Q[1-4]|S[12])$/.test(period.code));
 const selectedPeriod=selectablePeriods.find(period=>period.code===params.period)??selectablePeriods[0];
 const calculation=selectedPeriod?await getSectionGradebook(section.sectionId,roster.map(student=>student.studentId),selectedPeriod.code):null;
 const rowByStudentId=new Map(calculation?.rows.map(row=>[row.studentId,row])??[]);
 const gradedRows=calculation?.rows.filter(row=>row.overallPercent!==null)??[];
 const classAverage=gradedRows.length?gradedRows.reduce((sum,row)=>sum+(row.overallPercent??0),0)/gradedRows.length:null;
 const missingCount=calculation?.rows.reduce((sum,row)=>sum+row.missingCount,0)??0;
 const unenteredCount=calculation?.rows.reduce((sum,row)=>sum+row.unenteredCount,0)??0;
 const mode=calculation?.mode??"quarter";
 const semesterQuarterCodes=selectedPeriod?.code==="S1"?["Q1","Q2"]:selectedPeriod?.code==="S2"?["Q3","Q4"]:[];
 return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Teacher Gradebook</p><h1>{section.courseName}</h1><p className="subtle">{section.sectionName} • live grades from the canonical grading engine</p></div><div className="grade-audit-header-actions"><Link className="secondary-link" href={`/gradebook/audit${selectedPeriod?`?period=${selectedPeriod.code}`:""}`}>Grade Audit</Link><Link className="secondary-link" href="/">Dashboard</Link></div></header>
 <section className={`content-wrap ${styles.content}`}><article className={`panel ${styles.controls}`}><div className="panel-header"><div><p className="eyebrow">Class view</p><h3>Current grades</h3></div></div><form method="get" className={styles.periodForm}><label><span>Grading period</span><select name="period" defaultValue={selectedPeriod?.code} aria-label="Select grading period">{selectablePeriods.map(period=><option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label><button className="primary-button" type="submit">View Gradebook</button></form></article>
 <section className={`metric-grid ${styles.metrics}`} aria-label="Gradebook summary"><article className="metric-card"><span className="metric-label">Active students</span><strong>{roster.length}</strong></article><article className="metric-card"><span className="metric-label">Class average</span><strong>{formatPercent(classAverage)}</strong></article><article className="metric-card"><span className="metric-label">Missing flags</span><strong>{missingCount}</strong></article><article className="metric-card"><span className="metric-label">Unentered scores</span><strong>{unenteredCount}</strong></article></section>
 <article className={`panel full-width ${styles.tablePanel}`}><div className="panel-header"><div><p className="eyebrow">{selectedPeriod?.code??"Gradebook"}</p><h3>{mode==="semester"?"Semester grade overview":"Quarter category overview"}</h3></div><span className="subtle">{gradedRows.length} of {roster.length} students currently have a computed grade</span></div>
 <div className={styles.tableScroll}><div className={styles.table} role="table" aria-label={`${selectedPeriod?.code??"Current"} class gradebook`}>
 {mode==="semester"?<div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Current {selectedPeriod?.code}</span><span>{semesterQuarterCodes[0]}</span><span>{semesterQuarterCodes[1]}</span><span>Exam</span><span>Missing</span><span>Audit</span></div>:<div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Current {selectedPeriod?.code}</span><span>Participation</span><span>Quizzes</span><span>Tests</span><span>Missing</span><span>Audit</span></div>}
 {roster.map(student=>{const row=rowByStudentId.get(student.studentId);return <div className={styles.row} role="row" key={student.studentId}><span className={styles.student}><strong>{student.displayName}</strong>{student.email?<small>{student.email}</small>:null}</span><strong className={styles.overall}>{formatPercent(row?.overallPercent??null)}</strong>{mode==="semester"?<><span>{formatPercent(row?.componentPercents[semesterQuarterCodes[0]]??null)}</span><span>{formatPercent(row?.componentPercents[semesterQuarterCodes[1]]??null)}</span><span>{formatPercent(row?.componentPercents.EXAM??null)}</span></>:<><span>{formatPercent(row?.categoryPercents.participation??null)}</span><span>{formatPercent(row?.categoryPercents.quiz??null)}</span><span>{formatPercent(row?.categoryPercents.test??null)}</span></>}<span className={styles.flags}>{row?.missingCount?<span className="status warning-pill">{row.missingCount} missing</span>:<span className="status neutral-pill">0 missing</span>}{row?.unenteredCount?<small>{row.unenteredCount} unentered</small>:null}</span><Link className="text-button" href={`/gradebook/audit?studentId=${student.studentId}&period=${selectedPeriod?.code??"Q1"}`}>Audit →</Link></div>})}
 </div></div></article></section></main>;
}
