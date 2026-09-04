"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpenCheck, ClipboardPlus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { SectionScopeNav } from "@/components/section-scope-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import type { TeacherDashboardData } from "@/lib/data/dashboard";

type TeacherSectionOption = {
  sectionId: string;
  sectionName: string;
  offeringId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
};

type DashboardShellProps = {
  courseName: string;
  schoolYear: string;
  sectionName: string;
  sections: TeacherSectionOption[];
  activeSectionId: string;
  dashboard: TeacherDashboardData;
  canShowAllSections?: boolean;
};

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function dashboardHref(scope: "section" | "all", periodCode?: string) {
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  if (periodCode) params.set("period", periodCode);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function DashboardShell({ courseName, schoolYear, sectionName, sections, activeSectionId, dashboard, canShowAllSections = false }: DashboardShellProps) {
  const selectedPeriod = dashboard.selectedPeriod;
  const sectionHref = dashboardHref("section", selectedPeriod?.code);
  const allHref = dashboardHref("all", selectedPeriod?.code);
  const attentionStudents = dashboard.attentionStudents.slice(0, 4);
  const recentAssignments = dashboard.recentAssignments.slice(0, 6);

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>{courseName}</h1>
        <p className="subtle">{schoolYear} • {sectionName}{selectedPeriod ? ` • ${selectedPeriod.code}` : ""}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={activeSectionId} returnTo={sectionHref}/>
      </div>
    </header>
    <TeacherPrimaryNav/>
    {canShowAllSections ? <SectionScopeNav
      sectionLabel={sectionName}
      sectionHref={sectionHref}
      allLabel="All Sections"
      allHref={allHref}
      activeScope="section"
      ariaLabel="Dashboard section scope"
    /> : null}
    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Dashboard</p><h2>What needs your attention?</h2><p className="subtle">● Live canonical course data</p></div>
        <div className="grade-audit-header-actions">
          {dashboard.periods.length > 1 ? <form method="get" action="/dashboard">
            <select name="period" aria-label="Select grading period" defaultValue={selectedPeriod?.code} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
              {dashboard.periods.map((period) => <option key={period.code} value={period.code}>{period.code} — {period.name}</option>)}
            </select>
          </form> : null}
          <Link className="secondary-link" href={selectedPeriod ? `/student/preview?period=${encodeURIComponent(selectedPeriod.code)}` : "/student/preview"}>Student Preview</Link>
          <Link className="primary-button" href="/assignments/new"><ClipboardPlus size={18}/> New Assignment</Link>
        </div>
      </div>

      <section className="metric-grid" aria-label="Class snapshot">
        <MetricCard icon={<Users size={20}/>} label="Students" value={String(dashboard.studentCount)}/>
        <MetricCard icon={<BookOpenCheck size={20}/>} label="Class Average" value={formatPercent(dashboard.classAverage)}/>
        <MetricCard icon={<AlertTriangle size={20}/>} label="Missing Work" value={String(dashboard.missingCount)}/>
        <MetricCard icon={<RotateCcw size={20}/>} label="Retakes" value={String(dashboard.retakeCount)}/>
        <MetricCard icon={<ShieldCheck size={20}/>} label="PS Mismatches" value={String(dashboard.powerSchoolMismatchCount)}/>
      </section>

      <section className="dashboard-grid">
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Students to review</p><h3>Needs attention</h3></div><Link className="text-button" href="/students">View roster <ArrowRight size={16}/></Link></div>
          <div className="student-list">
            {attentionStudents.length ? attentionStudents.map((student) => {
              const mismatch = student.powerSchoolDifference !== null && Math.abs(student.powerSchoolDifference) >= 0.1;
              const reason = student.missingCount > 0
                ? `${student.missingCount} missing${mismatch ? " • PowerSchool mismatch" : ""}`
                : "PowerSchool mismatch";
              const profileParams = new URLSearchParams({ sectionId: activeSectionId, returnTo: sectionHref });
              if (selectedPeriod) profileParams.set("period", selectedPeriod.code);
              return <Link className="student-row" key={student.studentId} href={`/students/${student.studentId}?${profileParams.toString()}`}>
                <div><strong>{student.displayName}</strong><span>{reason}</span></div><strong>{formatPercent(student.currentGrade)}</strong>
              </Link>;
            }) : <div className="empty-state"><ShieldCheck size={28}/><h3>Nothing needs review right now</h3><p className="subtle">No Missing flags or captured PowerSchool mismatches for this period.</p></div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Grade integrity</p><h3>PowerSchool comparison</h3></div></div>
          <div className="integrity-stack">
            <div className="integrity-item success"><span>Within tolerance</span><strong>{dashboard.powerSchoolWithinTolerance}</strong></div>
            <div className="integrity-item warning"><span>Needs review</span><strong>{dashboard.powerSchoolMismatchCount}</strong></div>
            <div className="integrity-item"><span>Not captured</span><strong>{dashboard.powerSchoolNotCapturedCount}</strong></div>
            <Link className="secondary-link dashboard-audit-link" href={selectedPeriod ? `/gradebook/powerschool?period=${encodeURIComponent(selectedPeriod.code)}` : "/gradebook/powerschool"}>Open PowerSchool Comparison <ArrowRight size={16}/></Link>
          </div>
        </article>
      </section>

      <section className="panel full-width">
        <div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>{selectedPeriod ? `${selectedPeriod.code} assignments` : "Recent assignments"}</h3></div><Link className="text-button" href="/assignments">View assignments <ArrowRight size={16}/></Link></div>
        {recentAssignments.length ? <div className="assignment-table" role="table" aria-label="Recent assignments">
          <div className="assignment-row table-head" role="row"><span>Assignment</span><span>Type</span><span>Date</span><span>Class Avg.</span><span>Status</span></div>
          {recentAssignments.map((assignment) => {
            const status = assignment.missingCount > 0
              ? `${assignment.missingCount} missing`
              : assignment.rosterCount === 0
                ? "No students"
                : assignment.enteredCount >= assignment.rosterCount
                  ? "Complete"
                  : `${assignment.enteredCount}/${assignment.rosterCount} entered`;
            const statusClass = assignment.missingCount > 0 ? "status warning-pill" : assignment.enteredCount >= assignment.rosterCount && assignment.rosterCount > 0 ? "status success-pill" : "status neutral-pill";
            return <Link className="assignment-row" role="row" href={`/assignments/${assignment.id}`} key={assignment.id}>
              <strong>{assignment.title}</strong><span>{assignment.type}</span><span>{assignment.date}</span><span>{formatPercent(assignment.classAverage)}</span><span className={statusClass}>{status}</span>
            </Link>;
          })}
        </div> : <div className="empty-state"><BookOpenCheck size={30}/><h3>No assignments in this period yet</h3><p className="subtle">Create an assignment to begin collecting live grade data for this course.</p></div>}
      </section>
    </section>
  </main>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></article>;
}
