import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowRight, BookOpenCheck, CircleAlert, Layers3 } from "lucide-react";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import type { StudentDashboardData } from "@/lib/data/student-dashboard";
import styles from "./student-courses-view.module.css";

export type StudentCourseCard = {
  sectionId: string;
  courseName: string;
  sectionName: string;
  schoolYear: string;
  data: StudentDashboardData | null;
};

type StudentCoursesViewProps = {
  studentName: string;
  courses: StudentCourseCard[];
  actionPath: string;
  openCourseFields?: { name: string; value: string }[];
  preview?: boolean;
  previewLabel?: string;
  previewStudents?: { studentId: string; displayName: string }[];
  previewStudentId?: string;
  previewActionPath?: string;
  previewCarryFields?: { name: string; value: string }[];
  previewHeaderActions?: ReactNode;
};

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

function courseHref(actionPath: string, fields: { name: string; value: string }[], sectionId: string) {
  const params = new URLSearchParams();
  for (const field of fields) params.set(field.name, field.value);
  params.set("sectionId", sectionId);
  const query = params.toString();
  return query ? `${actionPath}?${query}` : actionPath;
}

export function StudentCoursesView({
  studentName,
  courses,
  actionPath,
  openCourseFields = [],
  preview = false,
  previewLabel,
  previewStudents = [],
  previewStudentId,
  previewActionPath = "/student/preview",
  previewCarryFields = [],
  previewHeaderActions,
}: StudentCoursesViewProps) {
  const totalMissing = courses.reduce((sum, course) => sum + (course.data?.missingCount ?? 0), 0);
  const readyCourseCount = courses.filter((course) => course.data).length;

  return <main className={`app-shell ${styles.shell}`}>
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Progress</p>
        <h1>My Courses</h1>
        <p className="subtle">{studentName} • {courses.length} active {courses.length === 1 ? "course" : "courses"}</p>
        {preview ? previewHeaderActions : null}
      </div>
    </header>
    {preview ? <TeacherPrimaryNav/> : <StudentPrimaryNav/>}

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div>
          <span>Teacher preview</span>
          <small>{previewLabel ?? "This is the course chooser the selected student will see when they have multiple active courses."}</small>
        </div>
        {previewStudents.length > 0 && previewStudentId ? <form method="get" action={previewActionPath} className={styles.previewForm}>
          {previewCarryFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span>Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
          <button type="submit" className="secondary-link">Switch</button>
        </form> : null}
      </div> : null}

      <div className={styles.introRow}>
        <div>
          <p className="eyebrow">Your classes</p>
          <h2>Choose a course to see your full progress</h2>
          <p className="subtle">Each course uses the same live grade calculations, Missing-work rules, retakes, and Grade Simulator as the full course dashboard.</p>
        </div>
        <div className={styles.summaryPills} aria-label="Course summary">
          <span><BookOpenCheck size={16}/><strong>{readyCourseCount}</strong> grade-ready</span>
          <span className={totalMissing ? styles.warningPill : ""}><CircleAlert size={16}/><strong>{totalMissing}</strong> Missing</span>
        </div>
      </div>

      <section className={styles.courseGrid} aria-label="My active courses">
        {courses.map((course) => {
          const data = course.data;
          const hasSeparateSummary = Boolean(data && data.summaryPeriodCode !== data.periodCode);
          return <article className={styles.courseCard} key={course.sectionId}>
            <div className={styles.courseHeader}>
              <div>
                <p className="eyebrow">{course.schoolYear}</p>
                <h3>{course.courseName}</h3>
                <p>{course.sectionName}{data ? ` • ${data.periodCode} — ${data.periodName}` : ""}</p>
              </div>
              <span className={data ? styles.readyBadge : styles.pendingBadge}>{data ? "Live grades" : "Not ready"}</span>
            </div>

            {data ? <>
              <div className={styles.metricGrid}>
                <div className={styles.metric}><span>Current {data.periodCode}</span><strong>{formatPercent(data.periodPercent)}</strong></div>
                <div className={styles.metric}><span>{hasSeparateSummary ? `Current ${data.summaryPeriodCode}` : "Categories"}</span><strong>{hasSeparateSummary ? formatPercent(data.summaryPercent) : String(data.categories.length)}</strong></div>
                <div className={`${styles.metric} ${data.missingCount ? styles.metricWarning : ""}`}><span>Missing</span><strong>{data.missingCount}</strong></div>
                <div className={styles.metric}><span>Assignments</span><strong>{data.assignments.length}</strong></div>
              </div>
              <p className={styles.courseNote}>{data.missingCount ? `${data.missingCount} assignment${data.missingCount === 1 ? " needs" : "s need"} attention in ${data.periodCode}.` : `No Missing work is currently flagged in ${data.periodCode}.`}</p>
            </> : <div className={styles.notReady}><Layers3 size={20}/><span>Your enrollment is active, but grading periods are not ready for this course yet.</span></div>}

            <div className={styles.courseFooter}>
              <Link className="primary-button" href={courseHref(actionPath, openCourseFields, course.sectionId)}>Open course <ArrowRight size={17}/></Link>
            </div>
          </article>;
        })}
      </section>
    </section>
  </main>;
}
