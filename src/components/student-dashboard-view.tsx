import Link from "next/link";
import { GradeSimulator } from "@/components/grade-simulator";
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
}: StudentDashboardViewProps) {
  const recentAssignments = data.assignments.slice(0, 10);
  const previewCarryFields = hiddenFields.filter((field) => field.name !== "studentId" && field.name !== "period");
  const categoryLabel = (category: string) => data.simulator.rules.categoryLabels?.[category] ?? category;

  return <main className={`app-shell ${styles.shell}`}>
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Progress</p>
        <h1>{courseName}</h1>
        <p className="subtle">{studentName} • {sectionName} • {schoolYear}</p>
      </div>
      {preview ? <Link className="secondary-link" href="/">Teacher Dashboard</Link> : null}
    </header>

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div><span>Teacher preview</span><small>{previewLabel ?? "This is the same dashboard the selected student will see."}</small></div>
        {previewStudents.length && previewStudentId ? <form method="get" action={previewActionPath} className={styles.previewForm}>
          <input type="hidden" name="period" value={data.quarterCode}/>
          {previewCarryFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
          <button type="submit" className="secondary-link">Switch</button>
        </form> : null}
      </div> : null}

      <article className={`panel ${styles.controls}`}>
        <div className="panel-header"><div><p className="eyebrow">Grading period</p><h3>Choose what you want to review</h3></div></div>
        <form method="get" action={periodActionPath} className={styles.periodForm}>
          {hiddenFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Quarter</span><select name="period" defaultValue={data.quarterCode}>{data.availableQuarterCodes.map((quarter) => <option value={quarter.code} key={quarter.code}>{quarter.code} — {quarter.name}</option>)}</select></label>
          <button className="primary-button" type="submit">View Progress</button>
        </form>
      </article>

      <section className={styles.heroGrid} aria-label="Current grades">
        <article className={styles.gradeHero}>
          <span className={styles.gradeLabel}>Current {data.quarterCode}</span>
          <strong className={styles.gradeValue}>{formatPercent(data.quarterPercent)}</strong>
          <p>Based only on categories and assignments that currently have grade data.</p>
        </article>
        <article className={styles.gradeHero}>
          <span className={styles.gradeLabel}>Current {data.semesterCode}</span>
          <strong className={styles.gradeValue}>{formatPercent(data.semesterPercent)}</strong>
          <p>Uses the same dynamic semester weighting as the teacher gradebook while future components are still empty.</p>
        </article>
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
              </div>) : <div className={styles.empty}>No category grades have been entered for this quarter yet.</div>}
            </div>
          </div>
        </article>

        <aside className="panel">
          <div className="panel-header"><div><p className="eyebrow">Quick check</p><h3>Needs attention</h3></div></div>
          <div className={styles.attentionList}>
            <div className={`${styles.attentionItem} ${data.missingCount ? styles.missingAttention : ""}`}><span>Missing assignments</span><strong>{data.missingCount}</strong></div>
            <div className={styles.attentionItem}><span>Dropped assignments</span><strong>{data.droppedCount}</strong></div>
          </div>
          <div className={styles.simulatorCard}>
            <strong>Grade Simulator</strong>
            <p>Now available below. Try future scores without changing any real grade data.</p>
          </div>
        </aside>
      </section>

      <GradeSimulator data={data.simulator}/>

      <article className={`panel full-width ${styles.assignmentsPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Recent work</p><h3>{data.quarterCode} assignments</h3></div><span className="subtle">Most recent 10</span></div>
        <div className={styles.assignmentList}>
          <div className={`${styles.assignmentRow} ${styles.assignmentHead}`}><span>Assignment</span><span>Score</span><span>Status</span><span>Attempts</span></div>
          {recentAssignments.length ? recentAssignments.map((assignment) => <div className={styles.assignmentRow} key={assignment.assignmentId}>
            <span className={styles.assignmentInfo}><strong>{assignment.title}</strong><small>{assignment.date ?? "No date"} • {categoryLabel(assignment.category)}</small></span>
            <span className={styles.assignmentScore}>{assignment.missing ? "0.0%" : formatPercent(assignment.percent)}</span>
            <span>
              {assignment.missing ? <span className={`${styles.status} ${styles.statusMissing}`}>Missing</span> : <span className={`${styles.status} ${statusClass(assignment.status)}`}>{statusLabel(assignment.status)}</span>}
              {assignment.missing && assignment.dropped ? <span className={`${styles.status} ${styles.statusDropped}`}>Dropped</span> : null}
            </span>
            <span>{assignment.attemptCount > 1 ? `${assignment.attemptCount} attempts` : assignment.attemptCount === 1 ? "1 attempt" : "—"}</span>
            {assignment.attemptCount > 1 ? <details className={styles.attemptDetails}><summary>View attempt history</summary><div className={styles.attemptLine}>{assignment.attempts.map((attempt) => <span className={`${styles.attemptChip} ${attempt.counted ? styles.attemptChipCounted : ""}`} key={attempt.attemptNumber}>#{attempt.attemptNumber}: {attempt.earned}/{attempt.possible} ({attempt.percent.toFixed(1)}%){attempt.counted ? " • counts" : ""}</span>)}</div></details> : null}
          </div>) : <div className={styles.empty}>No assignments are available for this quarter yet.</div>}
        </div>
      </article>
    </section>
  </main>;
}
