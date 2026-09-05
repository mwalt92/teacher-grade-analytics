import Link from "next/link";
import type { ReactNode } from "react";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import type { StudentDashboardData } from "@/lib/data/student-dashboard";
import styles from "./student-dashboard-view.module.css";

type StudentDashboardViewProps = {
  studentName: string;
  courseName: string;
  sectionName: string;
  schoolYear: string;
  data: StudentDashboardData;
  periodActionPath: string;
  hiddenFields?: { name: string; value: string }[];
  preview?: boolean;
  previewLabel?: string;
  previewStudents?: { studentId: string; displayName: string }[];
  previewStudentId?: string;
  previewActionPath?: string;
  previewHeaderActions?: ReactNode;
  studentHeaderActions?: ReactNode;
};

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function statusLabel(status: StudentDashboardData["assignments"][number]["status"]) {
  if (status === "counted") return "Counts";
  if (status === "missing") return "Missing";
  if (status === "dropped") return "Dropped";
  if (status === "unentered") return "Not entered";
  return "Exempt";
}

function statusClass(status: StudentDashboardData["assignments"][number]["status"]) {
  if (status === "counted") return styles.statusCounted;
  if (status === "missing") return styles.statusMissing;
  if (status === "dropped") return styles.statusDropped;
  if (status === "unentered") return styles.statusUnentered;
  return styles.statusExempt;
}

export function StudentDashboardView({
  studentName,
  courseName,
  sectionName,
  schoolYear,
  data,
  periodActionPath,
  hiddenFields = [],
  preview = false,
  previewLabel,
  previewStudents = [],
  previewStudentId,
  previewActionPath = "/student/preview",
  previewHeaderActions,
  studentHeaderActions,
}: StudentDashboardViewProps) {
  const recentAssignments = data.assignments.slice(0, 10);
  const firstMissingAssignment = data.assignments.find((assignment) => assignment.missing) ?? null;
  const retakeCount = data.simulator.retakeOptions.length;
  const previewCarryFields = hiddenFields.filter((field) => field.name !== "studentId" && field.name !== "period");
  const categoryLabel = (category: string) => data.simulator.rules.categoryLabels?.[category] ?? category;
  const hasSeparateSummary = data.summaryPeriodCode !== data.periodCode;
  const previewSectionId = hiddenFields.find((field) => field.name === "sectionId")?.value;
  const previewAnchorSectionId = hiddenFields.find((field) => field.name === "anchorSectionId")?.value;

  const dashboardParams = new URLSearchParams();
  const gradesParams = new URLSearchParams();
  const simulatorParams = new URLSearchParams();
  const studyParams = new URLSearchParams();
  if (previewStudentId) {
    dashboardParams.set("studentId", previewStudentId);
    gradesParams.set("studentId", previewStudentId);
    simulatorParams.set("studentId", previewStudentId);
    studyParams.set("studentId", previewStudentId);
  }
  if (previewSectionId) {
    dashboardParams.set("sectionId", previewSectionId);
    gradesParams.set("sectionId", previewSectionId);
    simulatorParams.set("sectionId", previewSectionId);
    studyParams.set("sectionId", previewSectionId);
  }
  if (previewAnchorSectionId) {
    dashboardParams.set("anchorSectionId", previewAnchorSectionId);
    gradesParams.set("anchorSectionId", previewAnchorSectionId);
    simulatorParams.set("anchorSectionId", previewAnchorSectionId);
  }
  dashboardParams.set("period", data.periodCode);
  gradesParams.set("period", data.periodCode);
  simulatorParams.set("period", data.periodCode);
  if (preview) dashboardParams.set("view", "course");
  const contextualDashboardHref = preview
    ? `/student/preview?${dashboardParams.toString()}`
    : previewSectionId ? `/student?sectionId=${encodeURIComponent(previewSectionId)}&period=${encodeURIComponent(data.periodCode)}` : "/student";
  const contextualGradesHref = preview
    ? `/student/preview/grades?${gradesParams.toString()}`
    : previewSectionId ? `/student/grades?sectionId=${encodeURIComponent(previewSectionId)}&period=${encodeURIComponent(data.periodCode)}` : `/student/grades?period=${encodeURIComponent(data.periodCode)}`;
  const contextualSimulatorHref = preview
    ? `/student/preview/simulator?${simulatorParams.toString()}`
    : previewSectionId ? `/student/simulator?sectionId=${encodeURIComponent(previewSectionId)}&period=${encodeURIComponent(data.periodCode)}` : `/student/simulator?period=${encodeURIComponent(data.periodCode)}`;
  const contextualStudyHref = preview
    ? `/student/preview/study-library?${studyParams.toString()}`
    : previewSectionId ? `/student/study-library?sectionId=${encodeURIComponent(previewSectionId)}` : "/student/study-library";

  function assignmentHref(assignmentId: string) {
    if (!preview) return `/student/assignments/${assignmentId}`;
    const params = new URLSearchParams();
    if (previewStudentId) params.set("studentId", previewStudentId);
    if (previewSectionId) params.set("sectionId", previewSectionId);
    if (previewAnchorSectionId) params.set("anchorSectionId", previewAnchorSectionId);
    const query = params.toString();
    return `/student/preview/assignments/${assignmentId}${query ? `?${query}` : ""}`;
  }

  return <main className={`app-shell ${styles.shell}`}>
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Progress</p>
        <h1>{courseName}</h1>
        <p className="subtle">{studentName} • {sectionName} • {schoolYear}</p>
        {preview ? previewHeaderActions : studentHeaderActions}
      </div>
    </header>
    {preview ? <TeacherPrimaryNav/> : <StudentPrimaryNav dashboardHref={contextualDashboardHref} gradesHref={contextualGradesHref} simulatorHref={contextualSimulatorHref} studyLibraryHref={contextualStudyHref}/>}

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div><span>Teacher preview</span><small>{previewLabel ?? "This is the same dashboard the selected student will see."}</small></div>
        {previewStudents.length && previewStudentId ? <form method="get" action={previewActionPath} className={styles.previewForm}>
          <input type="hidden" name="period" value={data.periodCode}/>
          {previewCarryFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
          <button type="submit" className="secondary-link">Switch</button>
        </form> : null}
      </div> : null}

      <article className={`panel ${styles.controls}`}>
        <div className="panel-header"><div><p className="eyebrow">Grading period</p><h3>Choose what you want to review</h3></div></div>
        <form method="get" action={periodActionPath} className={styles.periodForm}>
          {hiddenFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Period</span><select name="period" defaultValue={data.periodCode}>{data.availablePeriods.map((period) => <option value={period.code} key={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <button className="primary-button" type="submit">View Progress</button>
        </form>
      </article>

      <section className={styles.heroGrid} aria-label="Current grades">
        <article className={styles.gradeHero}>
          <span className={styles.gradeLabel}>Current {data.periodCode}</span>
          <strong className={styles.gradeValue}>{formatPercent(data.periodPercent)}</strong>
          <p>Based only on categories and assignments that currently have grade data.</p>
        </article>
        {hasSeparateSummary ? <article className={styles.gradeHero}>
          <span className={styles.gradeLabel}>Current {data.summaryPeriodCode}</span>
          <strong className={styles.gradeValue}>{formatPercent(data.summaryPercent)}</strong>
          <p>{data.summaryPeriodName} uses the configured component weights and automatically excludes components that do not have grade data yet.</p>
        </article> : null}
      </section>

      <section className={styles.sectionGrid}>
        <article className="panel">
          <div className="panel-header"><div><p className="eyebrow">Category progress</p><h3>Where your grade is coming from</h3></div></div>
          <div className={styles.panelBody}>
            <div className={styles.categoryList}>
              {data.categories.length ? data.categories.map((category) => <div className={styles.categoryRow} key={category.category}>
                <span className={styles.categoryName}><strong>{category.label}</strong><small>{Math.round(category.configuredWeight * 100)}% course weight • {category.assignmentCount} counting</small></span>
                <span className={styles.barTrack} aria-hidden="true"><span className={styles.barFill} style={{ width: `${Math.max(0, Math.min(100, category.averagePercent))}%` }}/></span>
                <span className={styles.categoryScore}>{formatPercent(category.averagePercent)}{category.droppedCount ? <small>{category.droppedCount} dropped</small> : null}</span>
              </div>) : <div className={styles.empty}>No category grades have been entered for this period yet.</div>}
            </div>
          </div>
        </article>

        <aside className="panel">
          <div className="panel-header"><div><p className="eyebrow">Next steps</p><h3>What to do next</h3></div></div>
          <div className={styles.attentionList}>
            {firstMissingAssignment ? <Link className={`${styles.attentionItem} ${styles.missingAttention} ${styles.attentionLink}`} href={assignmentHref(firstMissingAssignment.assignmentId)}>
              <div className={styles.attentionCopy}><strong>Missing assignments</strong><small>Open the first missing item</small></div><strong>{data.missingCount}</strong>
            </Link> : <div className={styles.attentionItem}><div className={styles.attentionCopy}><strong>Missing assignments</strong><small>Nothing missing right now</small></div><strong>0</strong></div>}
            {retakeCount ? <Link className={`${styles.attentionItem} ${styles.retakeAttention} ${styles.attentionLink}`} href={contextualSimulatorHref}>
              <div className={styles.attentionCopy}><strong>Retakes available</strong><small>Model a retake in the simulator</small></div><strong>{retakeCount}</strong>
            </Link> : <div className={styles.attentionItem}><div className={styles.attentionCopy}><strong>Retakes available</strong><small>No current retake options</small></div><strong>0</strong></div>}
            <div className={styles.attentionItem}><div className={styles.attentionCopy}><strong>Dropped assignments</strong><small>Excluded by the configured drop rule</small></div><strong>{data.droppedCount}</strong></div>
          </div>
          <div className={styles.simulatorCard}>
            <strong>Grade Simulator</strong>
            <p>Try future scores and retakes without changing any real grade data.</p>
            <Link className={styles.inlineAction} href={contextualSimulatorHref}>Open Grade Simulator →</Link>
          </div>
        </aside>
      </section>

      <article className={`panel full-width ${styles.assignmentsPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>{data.periodCode} assignments</h3></div><Link className="secondary-link" href={contextualGradesHref}>View all grades</Link></div>
        <div className={styles.assignmentList}>
          <div className={`${styles.assignmentRow} ${styles.assignmentHead}`}><span>Assignment</span><span>Score</span><span>Status</span><span>Attempts</span></div>
          {recentAssignments.length ? recentAssignments.map((assignment) => <div className={styles.assignmentRow} key={assignment.assignmentId}>
            <span className={styles.assignmentInfo}><Link href={assignmentHref(assignment.assignmentId)} style={{ color: "inherit", textDecoration: "none" }}><strong>{assignment.title}</strong></Link><small>{assignment.date ?? "No date"} • {categoryLabel(assignment.category)}</small></span>
            <span className={styles.assignmentScore}>{assignment.missing ? "0.0%" : formatPercent(assignment.percent)}</span>
            <span>
              {assignment.missing ? <span className={`${styles.status} ${styles.statusMissing}`}>Missing</span> : <span className={`${styles.status} ${statusClass(assignment.status)}`}>{statusLabel(assignment.status)}</span>}
              {assignment.missing && assignment.dropped ? <span className={`${styles.status} ${styles.statusDropped}`}>Dropped</span> : null}
            </span>
            <span>{assignment.attemptCount > 1 ? `${assignment.attemptCount} attempts` : assignment.attemptCount === 1 ? "1 attempt" : "—"}</span>
            {assignment.attemptCount > 1 ? <details className={styles.attemptDetails}><summary>View attempt history</summary><div className={styles.attemptLine}>{assignment.attempts.map((attempt) => <span className={`${styles.attemptChip} ${attempt.counted ? styles.attemptChipCounted : ""}`} key={attempt.attemptNumber}>#{attempt.attemptNumber}: {attempt.earned}/{attempt.possible} ({attempt.percent.toFixed(1)}%){attempt.counted ? " • counts" : ""}</span>)}</div></details> : null}
          </div>) : <div className={styles.empty}>No assignments are available for this period yet.</div>}
        </div>
      </article>
    </section>
  </main>;
}
