"use client";

import { ArrowRight } from "lucide-react";
import { setActiveTeacherSection } from "@/app/teacher-section-actions";
import { SectionScopeNav } from "@/components/section-scope-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import type { OfferingAnalyticsData, SectionAnalyticsData } from "@/lib/data/analytics";
import type { TeacherSectionSummary } from "@/lib/data/teacher-context";
import styles from "./analytics-workspace.module.css";

type SharedProps = {
  courseName: string;
  schoolYear: string;
  sections: TeacherSectionSummary[];
  offeringSections: TeacherSectionSummary[];
  activeSectionId: string;
};

type AnalyticsWorkspaceProps = SharedProps & (
  | { scope: "section"; sectionName: string; analytics: SectionAnalyticsData }
  | { scope: "all"; sectionName: string; analytics: OfferingAnalyticsData }
);

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function analyticsHref(scope: "section" | "all", periodCode?: string) {
  const params = new URLSearchParams();
  if (scope === "all") params.set("scope", "all");
  if (periodCode) params.set("period", periodCode);
  const query = params.toString();
  return query ? `/analytics?${query}` : "/analytics";
}

function periodNumberLabel(sectionName: string, periodNumber: number | null) {
  return periodNumber == null ? sectionName : `${sectionName} • Period ${periodNumber}`;
}

export function AnalyticsWorkspace(props: AnalyticsWorkspaceProps) {
  const { courseName, schoolYear, sections, offeringSections, activeSectionId, sectionName, scope, analytics } = props;
  const selectedPeriod = analytics.selectedPeriod;
  const sectionHref = analyticsHref("section", selectedPeriod?.code);
  const allHref = analyticsHref("all", selectedPeriod?.code);
  const canShowAllSections = offeringSections.length > 1;
  const series = analytics.components.length ? analytics.components : analytics.categories;
  const seriesTitle = analytics.components.length ? "Grading period components" : "Category performance";
  const seriesSubtitle = analytics.components.length
    ? "Average student performance in each component of the selected composite period."
    : "Average student performance by configured grading category.";
  const maxBandCount = Math.max(1, ...analytics.gradeBands.map((band) => band.count));

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Analytics</h1>
        <p className="subtle">{courseName} • {scope === "all" ? "All Sections" : sectionName}{selectedPeriod ? ` • ${selectedPeriod.code}` : ""}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={activeSectionId} returnTo={scope === "all" ? allHref : sectionHref}/>
      </div>
    </header>
    <TeacherPrimaryNav/>
    {canShowAllSections ? <SectionScopeNav
      sectionLabel={sectionName}
      sectionHref={sectionHref}
      allLabel={`All Sections (${offeringSections.length})`}
      allHref={allHref}
      activeScope={scope}
      ariaLabel="Analytics section scope"
    /> : null}

    <section className="content-wrap">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Performance analytics</p>
          <h2>{scope === "all" ? "How is the course performing across sections?" : "How is this section performing?"}</h2>
          <p className="subtle">● Live canonical grade calculations • active students only</p>
        </div>
        {analytics.periods.length > 1 ? <form method="get" action="/analytics" className="grade-audit-header-actions">
          {scope === "all" ? <input type="hidden" name="scope" value="all"/> : null}
          <select name="period" aria-label="Select analytics grading period" defaultValue={selectedPeriod?.code} onChange={(event) => event.currentTarget.form?.requestSubmit()}>
            {analytics.periods.map((period) => <option key={period.code} value={period.code}>{period.code} — {period.name}</option>)}
          </select>
        </form> : null}
      </div>

      <section className={styles.summaryGrid} aria-label="Analytics summary">
        <SummaryCard label="Students" value={String(analytics.studentCount)} detail={`${analytics.gradedCount} with a calculated grade`}/>
        <SummaryCard label="Average" value={formatPercent(analytics.classAverage)} detail={selectedPeriod?.name ?? "No grading period"}/>
        <SummaryCard label="Median" value={formatPercent(analytics.median)} detail="Middle calculated student grade"/>
        <SummaryCard label="Missing" value={String(analytics.missingCount)} detail="Assignments marked Missing"/>
        <SummaryCard label="Unentered" value={String(analytics.unenteredCount)} detail={`${analytics.assignmentCount} assignment${analytics.assignmentCount === 1 ? "" : "s"} in scope`}/>
      </section>

      {scope === "all" ? <section className={styles.sectionGrid} aria-label="Section comparison">
        {analytics.sections.map((section) => <article className={styles.sectionCard} key={section.sectionId}>
          <div className={styles.sectionCardHeader}>
            <div><strong>{section.sectionName}</strong><small>{section.periodNumber == null ? "Course section" : `Period ${section.periodNumber}`}</small></div>
            {section.sectionId === activeSectionId ? <span className="status success-pill">Current</span> : null}
          </div>
          <div className={styles.sectionStats}>
            <SectionStat label="Students" value={String(section.studentCount)}/>
            <SectionStat label="Average" value={formatPercent(section.classAverage)}/>
            <SectionStat label="Median" value={formatPercent(section.median)}/>
            <SectionStat label="Missing" value={String(section.missingCount)}/>
          </div>
          <form action={setActiveTeacherSection} className={styles.openSection}>
            <input type="hidden" name="sectionId" value={section.sectionId}/>
            <input type="hidden" name="returnTo" value={sectionHref}/>
            <button type="submit">Open {section.sectionName} <ArrowRight size={14}/></button>
          </form>
        </article>)}
      </section> : null}

      <section className={styles.analyticsGrid}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Grade distribution</p><h3>Calculated student grades</h3></div><span className="status neutral-pill">{analytics.gradedCount} graded</span></div>
          {analytics.gradedCount ? <div className={styles.distribution}>
            {analytics.gradeBands.map((band) => <div className={styles.bandRow} key={band.key}>
              <span>{band.label}</span>
              <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(band.count / maxBandCount) * 100}%` }}/></div>
              <strong>{band.count}</strong>
            </div>)}
          </div> : <div className={styles.empty}>No calculated grades yet for this period.</div>}
        </article>

        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Breakdown</p><h3>{seriesTitle}</h3><p className="subtle">{seriesSubtitle}</p></div></div>
          {series.length ? <div className={styles.seriesList}>
            {series.map((item) => <div className={styles.seriesRow} key={item.key}>
              <div><span>{item.label}</span><small>{item.studentCount} student{item.studentCount === 1 ? "" : "s"} with data</small></div>
              <strong>{formatPercent(item.average)}</strong>
            </div>)}
          </div> : <div className={styles.empty}>No category or component averages are available yet.</div>}
        </article>
      </section>

      <section className="panel full-width">
        <div className="panel-header">
          <div><p className="eyebrow">Student detail</p><h3>Grade and workload review</h3><p className="subtle">Calculated grades are sorted lowest to highest; students without a calculated grade appear last.</p></div>
          <span className="status neutral-pill">{analytics.students.length} active</span>
        </div>
        {analytics.students.length ? <div className={styles.studentTable} role="table" aria-label="Student analytics">
          <div className={`${styles.studentRow} ${styles.studentRowHead}`} role="row"><span>Student</span><span>Section</span><span>Grade</span><span>Missing</span><span>Unentered</span></div>
          {analytics.students.map((student) => {
            const studentSectionId = "sectionId" in student ? student.sectionId : activeSectionId;
            const studentSectionName = "sectionName" in student ? periodNumberLabel(student.sectionName, student.periodNumber) : sectionName;
            const auditHref = selectedPeriod ? `/gradebook/audit?studentId=${student.studentId}&period=${encodeURIComponent(selectedPeriod.code)}` : `/gradebook/audit?studentId=${student.studentId}`;
            return <div className={styles.studentRow} role="row" key={`${studentSectionId}:${student.studentId}`}>
              <div className={styles.studentName}>
                {scope === "all" ? <form action={setActiveTeacherSection}>
                  <input type="hidden" name="sectionId" value={studentSectionId}/><input type="hidden" name="returnTo" value={auditHref}/>
                  <button type="submit" className={styles.studentButton}>{student.displayName}</button>
                </form> : <a className={styles.studentButton} href={auditHref}>{student.displayName}</a>}
                <small>{student.overallPercent === null ? "No calculated grade yet" : "Open grade audit"}</small>
              </div>
              <span className={styles.muted}>{studentSectionName}</span>
              <span className={styles.gradeValue}>{formatPercent(student.overallPercent)}</span>
              <span className={student.missingCount ? styles.warningValue : styles.muted}>{student.missingCount}</span>
              <span className={student.unenteredCount ? styles.warningValue : styles.muted}>{student.unenteredCount}</span>
            </div>;
          })}
        </div> : <div className={styles.empty}>No active students are enrolled in this scope yet.</div>}
      </section>
    </section>
  </main>;
}

function SummaryCard({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article className={styles.summaryCard}><span>{label}</span><strong>{value}</strong><small>{detail}</small></article>;
}

function SectionStat({ label, value }: { label: string; value: string }) {
  return <div className={styles.sectionStat}><span>{label}</span><strong>{value}</strong></div>;
}
