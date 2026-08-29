"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, ArrowRight, BookOpenCheck, ClipboardPlus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { demoAssignments, demoStudents } from "@/lib/demo-data";

type TeacherSectionOption = {
  sectionId: string;
  sectionName: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
};

type DashboardShellProps = {
  courseName?: string;
  schoolYear?: string;
  sectionName?: string;
  studentCount?: number;
  dataMode?: string;
  sections?: TeacherSectionOption[];
  activeSectionId?: string;
  gradingPeriods?: { code: string; name: string }[];
};

export function DashboardShell({
  courseName = "ACP Calculus I M215",
  schoolYear = "2026–2027",
  sectionName = "Section 1",
  studentCount = demoStudents.length,
  dataMode = "Demo data only",
  sections = [],
  activeSectionId = "",
  gradingPeriods = [{ code: "Q1", name: "Quarter 1" }],
}: DashboardShellProps) {
  const [period, setPeriod] = useState(gradingPeriods[0]?.code ?? "");
  const classAverage = useMemo(() => {
    const grades = demoStudents.map((student) => student.currentGrade);
    return grades.reduce((sum, grade) => sum + grade, 0) / grades.length;
  }, []);
  const missingCount = demoStudents.reduce((sum, student) => sum + student.missingCount, 0);
  const retakeCount = demoAssignments.reduce((sum, assignment) => sum + assignment.retakes, 0);
  const mismatchCount = demoStudents.filter((student) => student.powerSchoolDifference !== 0).length;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>{courseName}</h1>
        <p className="subtle">{schoolYear} • {sectionName}{period ? ` • ${period}` : ""}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={activeSectionId} returnTo="/"/>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Dashboard</p><h2>What needs your attention?</h2><p className="subtle">● {dataMode}</p></div>
        <div className="grade-audit-header-actions">
          {gradingPeriods.length > 1 ? <select aria-label="Select grading period" value={period} onChange={(event) => setPeriod(event.target.value)}>{gradingPeriods.map((gradingPeriod) => <option key={gradingPeriod.code} value={gradingPeriod.code}>{gradingPeriod.code} — {gradingPeriod.name}</option>)}</select> : null}
          <Link className="secondary-link" href="/student/preview">Student Preview</Link>
          <Link className="primary-button" href="/assignments/new"><ClipboardPlus size={18}/> New Assignment</Link>
        </div>
      </div>
      <section className="metric-grid" aria-label="Class snapshot"><MetricCard icon={<Users size={20}/>} label="Students" value={String(studentCount)}/><MetricCard icon={<BookOpenCheck size={20}/>} label="Class Average" value={`${classAverage.toFixed(1)}%`}/><MetricCard icon={<AlertTriangle size={20}/>} label="Missing Work" value={String(missingCount)}/><MetricCard icon={<RotateCcw size={20}/>} label="Retakes" value={String(retakeCount)}/><MetricCard icon={<ShieldCheck size={20}/>} label="PS Mismatches" value={String(mismatchCount)}/></section>
      <section className="dashboard-grid"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Students to review</p><h3>Needs attention</h3></div><Link className="text-button" href="/students">View all <ArrowRight size={16}/></Link></div><div className="student-list">{demoStudents.filter((student) => student.missingCount > 0 || Math.abs(student.powerSchoolDifference) >= .1).slice(0, 4).map((student) => <button className="student-row" key={student.id}><div><strong>{student.name}</strong><span>{student.missingCount > 0 ? `${student.missingCount} missing` : "PowerSchool mismatch"}</span></div><strong>{student.currentGrade.toFixed(1)}%</strong></button>)}</div></article>
        <article className="panel"><div className="panel-header"><div><p className="eyebrow">Grade integrity</p><h3>PowerSchool comparison</h3></div></div><div className="integrity-stack"><div className="integrity-item success"><span>Within tolerance</span><strong>{demoStudents.length - mismatchCount}</strong></div><div className="integrity-item warning"><span>Needs review</span><strong>{mismatchCount}</strong></div><Link className="secondary-link dashboard-audit-link" href="/gradebook/audit">Open Grade Audit <ArrowRight size={16}/></Link></div></article></section>
      <section className="panel full-width"><div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>Recent assignments</h3></div><Link className="text-button" href="/assignments">View assignments <ArrowRight size={16}/></Link></div><div className="assignment-table" role="table" aria-label="Recent assignments"><div className="assignment-row table-head" role="row"><span>Assignment</span><span>Type</span><span>Date</span><span>Class Avg.</span><span>Status</span></div>{demoAssignments.map((assignment) => <button className="assignment-row" role="row" key={assignment.id}><strong>{assignment.title}</strong><span>{assignment.type}</span><span>{assignment.date}</span><span>{assignment.average}%</span><span className={assignment.missing > 0 ? "status warning-pill" : "status success-pill"}>{assignment.missing > 0 ? `${assignment.missing} missing` : "Complete"}</span></button>)}</div></section>
    </section>
  </main>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <button className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></button>;
}
