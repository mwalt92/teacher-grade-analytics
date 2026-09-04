import Link from "next/link";
import { redirect } from "next/navigation";
import { GradebookWorkspaceNav } from "@/components/gradebook-workspace-nav";
import { SectionScopeNav } from "@/components/section-scope-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionGradebook, getSectionGradingPeriods } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AllSectionsGradebook } from "./all-sections-gradebook";
import styles from "./gradebook.module.css";

function formatPercent(value:number|null,digits=2){return value===null?"—":`${value.toFixed(digits)}%`;}
type GradebookPageProps={searchParams:Promise<{period?:string;scope?:string}>};

export default async function GradebookPage({searchParams}:GradebookPageProps){
 const supabase=await createClient();
 const {data:claimsData,error:claimsError}=await supabase.auth.getClaims();
 const userId=claimsData?.claims?.sub;
 if(claimsError||typeof userId!=="string")redirect("/login");
 const [sections,section,params]=await Promise.all([getTeacherSections(),getActiveTeacherSection(),searchParams]);
 if(!section)return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;
 const offeringSections=sections.filter(candidate=>candidate.offeringId===section.offeringId);
 const canShowAllSections=offeringSections.length>1;
 const [roster,periods]=await Promise.all([getSectionRoster(section.sectionId,"active"),getSectionGradingPeriods(section.sectionId)]);
 const selectedPeriod=periods.find(period=>period.code===params.period)??periods[0];
 if(params.scope==="all"&&canShowAllSections&&selectedPeriod){
  return <AllSectionsGradebook sections={sections} offeringSections={offeringSections} activeSection={section} periods={periods} selectedPeriod={selectedPeriod}/>;
 }
 const calculation=selectedPeriod?await getSectionGradebook(section.sectionId,roster.map(student=>student.studentId),selectedPeriod.code):null;
 const rowByStudentId=new Map(calculation?.rows.map(row=>[row.studentId,row])??[]);
 const gradedRows=calculation?.rows.filter(row=>row.overallPercent!==null)??[];
 const classAverage=gradedRows.length?gradedRows.reduce((sum,row)=>sum+(row.overallPercent??0),0)/gradedRows.length:null;
 const missingCount=calculation?.rows.reduce((sum,row)=>sum+row.missingCount,0)??0;
 const unenteredCount=calculation?.rows.reduce((sum,row)=>sum+row.unenteredCount,0)??0;
 const categoryCodes=calculation&&calculation.mode==="direct"?Object.keys(calculation.rules.categoryWeights):[];
 let componentPeriods:typeof periods=[];
 if(selectedPeriod?.calculationMode==="composite"){
  const {data:componentRows}=await supabase.from("grading_period_components").select("component_period_id,sort_order").eq("parent_period_id",selectedPeriod.id).order("sort_order",{ascending:true});
  const periodById=new Map(periods.map(period=>[period.id,period]));
  componentPeriods=(componentRows??[]).map(row=>periodById.get(row.component_period_id)).filter((period):period is (typeof periods)[number]=>Boolean(period));
 }
 const detailColumns=calculation?.mode==="composite"?componentPeriods.map(period=>({key:period.code,label:period.periodRole==="exam"?"Exam":period.name})):categoryCodes.map(code=>({key:code,label:calculation?.rules.categoryLabels?.[code]??code}));
 const rowTemplate=`minmax(210px,1.7fr) minmax(105px,.8fr) repeat(${detailColumns.length},minmax(100px,.75fr)) minmax(105px,.8fr) minmax(70px,.5fr)`;
 const tableMinWidth=620+detailColumns.length*115;
 const sectionHref=selectedPeriod?`/gradebook?period=${encodeURIComponent(selectedPeriod.code)}`:"/gradebook";
 const allHref=selectedPeriod?`/gradebook?scope=all&period=${encodeURIComponent(selectedPeriod.code)}`:"/gradebook?scope=all";
 return <main className="app-shell"><header className="topbar"><div><p className="eyebrow">Teacher Gradebook</p><h1>{section.courseCode?`${section.courseName} ${section.courseCode}`:section.courseName}</h1><p className="subtle">{section.sectionName} • live grades from the canonical grading engine</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo={sectionHref}/></div></header>
 <TeacherPrimaryNav/>
 <GradebookWorkspaceNav active="overview" period={selectedPeriod?.code}/>
 {canShowAllSections?<SectionScopeNav sectionLabel={section.sectionName} sectionHref={sectionHref} allLabel={`All Sections (${offeringSections.length})`} allHref={allHref} activeScope="section" ariaLabel="Gradebook section scope"/>:null}
 <section className={`content-wrap ${styles.content}`}><article className={`panel ${styles.controls}`}><div className="panel-header"><div><p className="eyebrow">Class view</p><h3>Current grades</h3></div></div><form method="get" className={styles.periodForm}><label><span>Grading period</span><select name="period" defaultValue={selectedPeriod?.code} aria-label="Select grading period">{periods.map(period=><option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label><button className="primary-button" type="submit">View Gradebook</button></form></article>
 <section className={`metric-grid ${styles.metrics}`} aria-label="Gradebook summary"><article className="metric-card"><span className="metric-label">Active students</span><strong>{roster.length}</strong></article><article className="metric-card"><span className="metric-label">Class average</span><strong>{formatPercent(classAverage)}</strong></article><article className="metric-card"><span className="metric-label">Missing flags</span><strong>{missingCount}</strong></article><article className="metric-card"><span className="metric-label">Unentered scores</span><strong>{unenteredCount}</strong></article></section>
 <article className={`panel full-width ${styles.tablePanel}`}><div className="panel-header"><div><p className="eyebrow">{selectedPeriod?.code??"Gradebook"}</p><h3>{calculation?.mode==="composite"?"Composite period overview":selectedPeriod?.periodRole==="exam"?"Exam grade overview":"Category grade overview"}</h3></div><span className="subtle">{gradedRows.length} of {roster.length} students currently have a computed grade</span></div>
 <div className={styles.tableScroll}><div className={styles.table} style={{minWidth:tableMinWidth}} role="table" aria-label={`${selectedPeriod?.code??"Current"} class gradebook`}>
 <div className={`${styles.row} ${styles.head}`} style={{gridTemplateColumns:rowTemplate}} role="row"><span>Student</span><span>Current {selectedPeriod?.code}</span>{detailColumns.map(column=><span key={column.key}>{column.label}</span>)}<span>Missing</span><span>Audit</span></div>
 {roster.map(student=>{const row=rowByStudentId.get(student.studentId);const profileHref=`/students/${student.studentId}?sectionId=${encodeURIComponent(section.sectionId)}${selectedPeriod?`&period=${encodeURIComponent(selectedPeriod.code)}`:""}&returnTo=${encodeURIComponent(sectionHref)}`;return <div className={styles.row} style={{gridTemplateColumns:rowTemplate}} role="row" key={student.studentId}><Link className={styles.student} href={profileHref}><strong>{student.displayName}</strong>{student.email?<small>{student.email}</small>:null}</Link><strong className={styles.overall}>{formatPercent(row?.overallPercent??null)}</strong>{detailColumns.map(column=><span key={column.key}>{formatPercent(calculation?.mode==="composite"?row?.componentPercents[column.key]??null:row?.categoryPercents[column.key]??null)}</span>)}<span className={styles.flags}>{row?.missingCount?<span className="status warning-pill">{row.missingCount} missing</span>:<span className="status neutral-pill">0 missing</span>}{row?.unenteredCount?<small>{row.unenteredCount} unentered</small>:null}</span><Link className="text-button" href={`/gradebook/audit?studentId=${student.studentId}&period=${selectedPeriod?.code??""}`}>Audit →</Link></div>})}
 </div></div></article></section></main>;
}