"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight, BookOpenCheck, ClipboardPlus, Layers3, ShieldCheck, Users } from "lucide-react";
import { setActiveTeacherSection } from "@/app/teacher-section-actions";
import { TeacherContextBar } from "@/components/teacher-context-bar";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import type { TeacherOfferingDashboardData } from "@/lib/data/dashboard";
import type { TeacherSectionSummary } from "@/lib/data/teacher-context";
import styles from "./all-sections-dashboard.module.css";

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function sectionLabel(sectionName: string, periodNumber: number | null) {
  return periodNumber == null ? sectionName : `${sectionName} • Period ${periodNumber}`;
}

function dashboardHref(scope: "section" | "all", periodCode?: string) {
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  if (periodCode) params.set("period", periodCode);
  const query = params.toString();
  return query ? `/dashboard?${query}` : "/dashboard";
}

export function AllSectionsDashboard({
  courseName,
  schoolYear,
  sections,
  offeringSections,
  activeSectionId,
  dashboard,
}: {
  courseName: string;
  schoolYear: string;
  sections: TeacherSectionSummary[];
  offeringSections: TeacherSectionSummary[];
  activeSectionId: string;
  dashboard: TeacherOfferingDashboardData;
}) {
  const selectedPeriod = dashboard.selectedPeriod;
  const sectionHref = dashboardHref("section", selectedPeriod?.code);
  const allHref = dashboardHref("all", selectedPeriod?.code);
  const currentSectionLabel = offeringSections.find((section) => section.sectionId === activeSectionId)?.sectionName ?? "Current Section";
  const recentGroups = dashboard.recentAssignments.slice(0, 6);
  const attentionStudents = dashboard.attentionStudents.slice(0, 8);

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>{courseName}</h1>
        <p className="subtle">{schoolYear} • All Sections{selectedPeriod ? ` • ${selectedPeriod.code}` : ""}</p>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <TeacherContextBar
      sections={sections}
      activeSectionId={activeSectionId}
      returnTo={allHref}
      scope={{
        active: "all",
        sectionLabel: currentSectionLabel,
        sectionHref,
        allLabel: "All Sections",
        allHref,
        ariaLabel: "Dashboard section scope",
      }}
    />

    <section className="content-wrap">
      <div className="section-heading">
        <div><p className="eyebrow">Course dashboard</p><h2>What needs attention across your sections?</h2><p className="subtle">● Live canonical course data • section grades remain independent</p></div>
        <div className="grade-audit-header-actions">
          {dashboard.periods.length > 1 ? <form method="get" action="/dashboard">
            <input type="hidden" name="scope" value="all"/>
            <select name="period" aria-label="Select grading period" defaultValue={selectedPeriod?.code} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
              {dashboard.periods.map((period) => <option key={period.code} value={period.code}>{period.code} — {period.name}</option>)}
            </select>
          </form> : null}
          <Link className="secondary-link" href="/assignments?scope=all">All Assignments</Link>
          <Link className="primary-button" href="/assignments/new"><ClipboardPlus size={18}/> New Assignment</Link>
        </div>
      </div>

      <section className="metric-grid" aria-label="Course snapshot">
        <MetricCard icon={<Layers3 size={20}/>} label="Sections" value={String(dashboard.sectionCount)}/>
        <MetricCard icon={<Users size={20}/>} label="Students" value={String(dashboard.studentCount)}/>
        <MetricCard icon={<BookOpenCheck size={20}/>} label="Course Average" value={formatPercent(dashboard.classAverage)}/>
        <MetricCard icon={<AlertTriangle size={20}/>} label="Missing Work" value={String(dashboard.missingCount)}/>
        <MetricCard icon={<ShieldCheck size={20}/>} label="PS Mismatches" value={String(dashboard.powerSchoolMismatchCount)}/>
      </section>

      <section className={styles.sectionGrid} aria-label="Section snapshots">
        {dashboard.sections.map((section) => {
          const sectionDashboard = section.dashboard;
          const auditReturn = dashboardHref("section", selectedPeriod?.code);
          return <article className={styles.sectionCard} key={section.sectionId}>
            <div className={styles.sectionCardHeader}>
              <span><strong>{section.sectionName}</strong><small>{section.periodNumber != null ? `Period ${section.periodNumber}` : "Course section"}</small></span>
              {section.sectionId === activeSectionId ? <span className="status success-pill">Current</span> : null}
            </div>
            <div className={styles.sectionStats}>
              <div className={styles.sectionStat}><span>Students</span><strong>{sectionDashboard.studentCount}</strong></div>
              <div className={styles.sectionStat}><span>Average</span><strong>{formatPercent(sectionDashboard.classAverage)}</strong></div>
              <div className={styles.sectionStat}><span>Missing</span><strong>{sectionDashboard.missingCount}</strong></div>
              <div className={styles.sectionStat}><span>PS review</span><strong>{sectionDashboard.powerSchoolMismatchCount}</strong></div>
            </div>
            <form action={setActiveTeacherSection} className={styles.openSection}>
              <input type="hidden" name="sectionId" value={section.sectionId}/>
              <input type="hidden" name="returnTo" value={auditReturn}/>
              <button type="submit">Open {section.sectionName} <ArrowRight size={14}/></button>
            </form>
          </article>;
        })}
      </section>

      <section className={styles.dashboardSplit}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Students to review</p><h3>Needs attention across sections</h3></div><Link className="text-button" href="/students?scope=all">All Sections roster <ArrowRight size={16}/></Link></div>
          <div className={styles.attentionList}>
            {attentionStudents.length ? attentionStudents.map((student) => {
              const mismatch = student.powerSchoolDifference !== null && Math.abs(student.powerSchoolDifference) >= 0.1;
              const reason = student.missingCount > 0
                ? `${student.missingCount} missing${mismatch ? " • PowerSchool mismatch" : ""}`
                : "PowerSchool mismatch";
              const auditHref = selectedPeriod ? `/gradebook/audit?studentId=${student.studentId}&period=${encodeURIComponent(selectedPeriod.code)}` : `/gradebook/audit?studentId=${student.studentId}`;
              return <form action={setActiveTeacherSection} className={styles.attentionForm} key={`${student.sectionId}:${student.studentId}`}>
                <input type="hidden" name="sectionId" value={student.sectionId}/>
                <input type="hidden" name="returnTo" value={auditHref}/>
                <button className={styles.attentionButton} type="submit">
                  <span className={styles.attentionMeta}><strong>{student.displayName}</strong><span><span className={styles.sectionPill}>{student.sectionName}</span>{reason}</span></span>
                  <strong>{formatPercent(student.currentGrade)}</strong>
                </button>
              </form>;
            }) : <div className="empty-state"><ShieldCheck size={28}/><h3>Nothing needs review right now</h3><p className="subtle">No Missing flags or captured PowerSchool mismatches across these sections for this period.</p></div>}
          </div>
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Grade integrity</p><h3>PowerSchool across sections</h3></div></div>
          <div className={styles.integrityStack}>
            <div className={`${styles.integrityItem} ${styles.integritySuccess}`}><span>Within tolerance</span><strong>{dashboard.powerSchoolWithinTolerance}</strong></div>
            <div className={`${styles.integrityItem} ${styles.integrityWarning}`}><span>Needs review</span><strong>{dashboard.powerSchoolMismatchCount}</strong></div>
            <div className={styles.integrityItem}><span>Not captured</span><strong>{dashboard.powerSchoolNotCapturedCount}</strong></div>
            <div className={styles.integrityItem}><span>Retake attempts</span><strong>{dashboard.retakeCount}</strong></div>
          </div>
          <p className="subtle" style={{ marginTop: 12 }}>PowerSchool Comparison remains section-specific. Open a section above before reviewing individual mismatches.</p>
        </article>
      </section>

      <section className="panel full-width">
        <div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>{selectedPeriod ? `${selectedPeriod.code} across all sections` : "Recent assignments across sections"}</h3></div><Link className="text-button" href="/assignments?scope=all">All assignments <ArrowRight size={16}/></Link></div>
        {recentGroups.length ? <div className={styles.recentList}>
          {recentGroups.map((group) => <article className={styles.recentGroup} key={group.key}>
            <div className={styles.recentGroupHeader}>
              <div><strong>{group.title}</strong><small>{group.type} • {group.date}</small></div>
              <small className={group.diverged ? styles.difference : ""}>{group.linkGroupId ? `${group.sections.length} linked sections${group.diverged ? " • section details differ" : ""}` : "Single-section assignment"}</small>
            </div>
            <div className={styles.recentSectionRows}>
              {group.sections.map((assignment) => {
                const status = assignment.missingCount > 0
                  ? `${assignment.missingCount} missing`
                  : assignment.rosterCount === 0
                    ? "No students"
                    : assignment.enteredCount >= assignment.rosterCount
                      ? "Complete"
                      : `${assignment.enteredCount}/${assignment.rosterCount} entered`;
                const statusClass = assignment.missingCount > 0 ? "status warning-pill" : assignment.enteredCount >= assignment.rosterCount && assignment.rosterCount > 0 ? "status success-pill" : "status neutral-pill";
                return <form action={setActiveTeacherSection} className={styles.recentSectionForm} key={assignment.id}>
                  <input type="hidden" name="sectionId" value={assignment.sectionId}/>
                  <input type="hidden" name="returnTo" value={`/assignments/${assignment.id}`}/>
                  <button className={styles.recentSectionButton} type="submit">
                    <strong>{sectionLabel(assignment.sectionName, assignment.periodNumber)}</strong>
                    <span className={styles.muted}>{group.diverged ? `${assignment.title} • ${assignment.date}` : assignment.type}</span>
                    <span>{formatPercent(assignment.classAverage)}</span>
                    <span className={statusClass}>{status}</span>
                    <span className={styles.muted}>Grade entry →</span>
                  </button>
                </form>;
              })}
            </div>
          </article>)}
        </div> : <div className="empty-state"><BookOpenCheck size={30}/><h3>No assignments in this period yet</h3><p className="subtle">Create an assignment and publish it to one or more sections to begin collecting course data.</p></div>}
      </section>
    </section>
  </main>;
}

function MetricCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <article className="metric-card"><span className="metric-icon">{icon}</span><span className="metric-label">{label}</span><strong>{value}</strong></article>;
}
