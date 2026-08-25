"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpenCheck, ClipboardPlus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { demoAssignments, demoStudents } from "@/lib/demo-data";

const navItems = ["Dashboard", "Students", "Assignments", "Gradebook", "Analytics", "Settings"];
type DashboardShellProps = { courseName?:string; schoolYear?:string; sectionName?:string; studentCount?:number; dataMode?:string };

export function DashboardShell({ courseName="ACP Calculus I M211", schoolYear="2026–2027", sectionName="Semester 1", studentCount=demoStudents.length, dataMode="Demo data only" }:DashboardShellProps) {
  const [activeNav,setActiveNav]=useState("Dashboard"); const [period,setPeriod]=useState("Q1");
  const classAverage=useMemo(()=>{const grades=demoStudents.map(s=>s.currentGrade);return grades.reduce((sum,g)=>sum+g,0)/grades.length},[]);
  const missingCount=demoStudents.reduce((sum,s)=>sum+s.missingCount,0); const retakeCount=demoAssignments.reduce((sum,a)=>sum+a.retakes,0); const mismatchCount=demoStudents.filter(s=>s.powerSchoolDifference!==0).length;
  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>{courseName}</h1><p className="subtle">{schoolYear} • {sectionName} • {period}</p></div><div className="toolbar-group"><select aria-label="Select grading period" value={period} onChange={e=>setPeriod(e.target.value)}><option>Q1</option><option>Q2</option><option>S1</option></select><a className="primary-button" href="/assignments/new"><ClipboardPlus size={18}/> New Assignment</a></div></header>
    <nav className="main-nav" aria-label="Teacher navigation">{navItems.map(item=>item==="Students"?<Link key={item} className="nav-button" href="/students">{item}</Link>:item==="Gradebook"?<Link key={item} className="nav-button" href="/gradebook">{item}</Link>:<button key={item} className={activeNav===item?"nav-button active":"nav-button"} onClick={()=>setActiveNav(item)}>{item}</button>)}</nav>
    <section className="content-wrap"><div className="section-heading"><div><p className="eyebrow">{activeNav}</p><h2>What needs your attention?</h2></div><span className="save-indicator">● {dataMode}</span></div>
      <section className="metric-grid" aria-label="Class snapshot"><MetricCard icon={<Users size={20}/>} label="Students" value={String(studentCount)}/><MetricCard icon={<BookOpenCheck size={20}/>} label="Class Average" value={`${classAverage.toFixed(1)}%`}/><MetricCard icon={<AlertTriangle size={20}/>} label="Missing Work" value={String(missingCount)}/><MetricCard icon={<RotateCcw size={20}/>} label="Retakes" value={String(retakeCount)}/><MetricCard icon={<ShieldCheck size={20}/>} label="PS Mismatches" value={String(mismatchCount)}/></section>
      <section className="dashboard-grid"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Students to review</p><h3>Needs attention</h3></div><Link className="text-button" href="/students">View all <ArrowRight size={16}/></Link></div><div className="student-list">{demoStudents.filter(s=>s.missingCount>0||Math.abs(s.powerSchoolDifference)>=.1).slice(0,4).map(s=><button className="student-row" key={s.id}><div><strong>{s.name}</strong><span>{s.missingCount>0?`${s.missingCount} missing`:"PowerSchool mismatch"}</span></div><strong>{s.currentGrade.toFixed(1)}%</strong></button>)}</div></article>
        <article className="panel"><div className="panel-header"><div><p className="eyebrow">Grade integrity</p><h3>PowerSchool comparison</h3></div></div><div className="integrity-stack"><div className="integrity-item success"><span>Within tolerance</span><strong>{demoStudents.length-mismatchCount}</strong></div><div className="integrity-item warning"><span>Needs review</span><strong>{mismatchCount}</strong></div><Link className="secondary-link dashboard-audit-link" href="/gradebook/audit">Open Grade Audit <ArrowRight size={16}/></Link></div></article></section>
      <section className="panel full-width"><div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>Recent assignments</h3></div><button className="text-button">View assignments <ArrowRight size={16}/></button></div><div className="assignment-table" role="table" aria-label="Recent assignments"><div className="assignment-row table-head" role="row"><span>Assignment</span><span>Type</span><span>Date</span><span>Class Avg.</span><span>Status</span></div>{demoAssignments.map(a=><button className="assignment-row" role="row" key={a.id}><strong>{a.title}</strong><span>{a.type}</span><span>{a.date}</span><span>{a.average}%</span><span className={a.missing>0?"status warning-pill":"status success-pill"}>{a.missing>0?`${a.missing} missing`:"Complete"}</span></button>)}</div></section>
    </section>
  </main>;
}
function MetricCard({icon,label,value}:{icon:React.ReactNode;label:string;value:string}){return <button className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></button>}
