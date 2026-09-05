import Link from "next/link";
import type { ReactNode } from "react";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import type { StudentDashboardData } from "@/lib/data/student-dashboard";
import styles from "./student-grades-view.module.css";

type CourseOption = { sectionId: string; label: string };

type StudentGradesViewProps = {
  studentName: string;
  courseName: string;
  sectionName: string;
  schoolYear: string;
  data: StudentDashboardData;
  actionPath: string;
  hiddenFields?: { name: string; value: string }[];
  courseOptions?: CourseOption[];
  selectedSectionId: string;
  preview?: boolean;
  previewLabel?: string;
  previewHeaderActions?: ReactNode;
  previewStudents?: { studentId: string; displayName: string }[];
  previewStudentId?: string;
  previewActionPath?: string;
  dashboardHref?: string;
  gradesHref?: string;
  studyLibraryHref?: string;
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

export function StudentGradesView({
  studentName,
  courseName,
  sectionName,
  schoolYear,
  data,
  actionPath,
  hiddenFields = [],
  courseOptions = [],
  selectedSectionId,
  preview = false,
  previewLabel,
  previewHeaderActions,
  previewStudents = [],
  previewStudentId,
  previewActionPath = "/student/preview/grades",
  dashboardHref,
  gradesHref,
  studyLibraryHref,
}: StudentGradesViewProps) {
  const retakeCount = data.simulator.retakeOptions.length;
  const categoryLabel = (category: string) => data.simulator.rules.categoryLabels?.[category] ?? category;
  const sectionId = hiddenFields.find((field) => field.name === "sectionId")?.value ?? selectedSectionId;
  const anchorSectionId = hiddenFields.find((field) => field.name === "anchorSectionId")?.value;

  function assignmentHref(assignmentId: string) {
    if (!preview) return `/student/assignments/${assignmentId}`;
    const params = new URLSearchParams();
    if (previewStudentId) params.set("studentId", previewStudentId);
    if (sectionId) params.set("sectionId", sectionId);
    if (anchorSectionId) params.set("anchorSectionId", anchorSectionId);
    const query = params.toString();
    return `/student/preview/assignments/${assignmentId}${query ? `?${query}` : ""}`;
  }

  return <main className={`app-shell ${styles.shell}`}>
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Grades</p>
        <h1>{courseName}</h1>
        <p className="subtle">{studentName} • {sectionName} • {schoolYear}</p>
        {preview ? previewHeaderActions : null}
      </div>
    </header>
    {preview ? <TeacherPrimaryNav/> : <StudentPrimaryNav dashboardHref={dashboardHref} gradesHref={gradesHref} studyLibraryHref={studyLibraryHref}/>}

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div><span>Teacher preview</span><small>{previewLabel ?? "This is the complete grade history the selected student will see for this grading period."}</small></div>
        {previewStudents.length > 0 && previewStudentId ? <form method="get" action={previewActionPath} className={styles.previewForm}>
          {hiddenFields.filter((field) => field.name !== "studentId").map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
          <button className="secondary-link" type="submit">Switch</button>
        </form> : null}
      </div> : null}

      <article className={`panel ${styles.controls}`}>
        <div><p className="eyebrow">Grade history</p><h2>All {data.periodCode} assignments</h2><p className="subtle">Review every assignment, status, and attempt in this grading period.</p></div>
        <form method="get" action={actionPath} className={styles.filterForm}>
          {hiddenFields.filter((field) => field.name !== "sectionId" && field.name !== "period").map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          {courseOptions.length > 1 ? <label><span>Course</span><select name="sectionId" defaultValue={selectedSectionId}>{courseOptions.map((option) => <option key={option.sectionId} value={option.sectionId}>{option.label}</option>)}</select></label> : <input type="hidden" name="sectionId" value={selectedSectionId}/>} 
          <label><span>Grading period</span><select name="period" defaultValue={data.periodCode}>{data.availablePeriods.map((period) => <option key={period.code} value={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <button className="primary-button" type="submit">View Grades</button>
        </form>
      </article>

      <section className={styles.summaryGrid} aria-label="Grade summary">
        <article className={styles.summaryCard}><span>Current {data.periodCode}</span><strong>{formatPercent(data.periodPercent)}</strong><small>{data.periodName}</small></article>
        <article className={styles.summaryCard}><span>Assignments</span><strong>{data.assignments.length}</strong><small>In this grading period</small></article>
        <article className={`${styles.summaryCard} ${data.missingCount ? styles.summaryWarning : ""}`}><span>Missing</span><strong>{data.missingCount}</strong><small>{data.missingCount ? "Needs attention" : "Nothing missing"}</small></article>
        <article className={styles.summaryCard}><span>Retakes available</span><strong>{retakeCount}</strong><small>Scored assignments eligible now</small></article>
      </section>

      <article className={`panel ${styles.historyPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Complete history</p><h3>{data.periodCode} grade details</h3></div><span className="subtle">Newest first</span></div>
        {data.assignments.length ? <div className={styles.tableWrap}>
          <table className={styles.table} aria-label={`${data.periodCode} complete grade history`}>
            <thead><tr><th scope="col">Assignment</th><th scope="col">Category</th><th scope="col">Score</th><th scope="col">Status</th><th scope="col">Attempts</th></tr></thead>
            <tbody>{data.assignments.map((assignment) => <tr key={assignment.assignmentId}>
              <th scope="row"><Link className={styles.assignmentLink} href={assignmentHref(assignment.assignmentId)}><strong>{assignment.title}</strong><small>{assignment.date ?? "No date"}</small></Link></th>
              <td>{categoryLabel(assignment.category)}</td>
              <td className={styles.score}>{assignment.missing ? "0.0%" : formatPercent(assignment.percent)}</td>
              <td><div className={styles.statusStack}><span className={`${styles.status} ${statusClass(assignment.status)}`}>{statusLabel(assignment.status)}</span>{assignment.missing && assignment.dropped ? <span className={`${styles.status} ${styles.statusDropped}`}>Dropped</span> : null}</div></td>
              <td>{assignment.attemptCount > 1 ? <details className={styles.attemptDetails}><summary>{assignment.attemptCount} attempts</summary><div className={styles.attemptList}>{assignment.attempts.map((attempt) => <span key={attempt.attemptNumber} className={`${styles.attemptChip} ${attempt.counted ? styles.attemptCounted : ""}`}>A{attempt.attemptNumber}: {attempt.earned}/{attempt.possible} • {attempt.percent.toFixed(1)}%{attempt.counted ? " • counts" : ""}</span>)}</div></details> : assignment.attemptCount === 1 ? "1 attempt" : "—"}</td>
            </tr>)}</tbody>
          </table>
        </div> : <div className={styles.empty}>No assignments are available for this grading period yet.</div>}
      </article>
    </section>
  </main>;
}
