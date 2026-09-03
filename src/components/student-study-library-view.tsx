import Link from "next/link";
import type { ReactNode } from "react";
import { BookOpen, Star } from "lucide-react";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import styles from "./student-study-library-view.module.css";

export type StudentStudyGuideCard = {
  assignmentId: string;
  title: string;
  date: string | null;
  guideTitle: string;
  description: string | null;
  skillCount: number;
  resourceCount: number;
  recommendedCount: number;
  attemptCount: number;
  status: "Not attempted" | "Retake available" | "Recommended practice" | "Completed";
  href: string;
  draft?: boolean;
};

type CourseOption = { sectionId: string; label: string };

type StudentStudyLibraryViewProps = {
  studentName: string;
  courseName: string;
  sectionName: string;
  schoolYear: string;
  guides: StudentStudyGuideCard[];
  courseOptions?: CourseOption[];
  selectedSectionId: string;
  courseActionPath: string;
  preview?: boolean;
  previewLabel?: string;
  previewHeaderActions?: ReactNode;
  previewStudents?: { studentId: string; displayName: string }[];
  previewStudentId?: string;
  previewActionPath?: string;
  previewCarryFields?: { name: string; value: string }[];
};

function statusClass(status: StudentStudyGuideCard["status"]) {
  if (status === "Retake available") return styles.retake;
  if (status === "Recommended practice") return styles.recommended;
  if (status === "Completed") return styles.complete;
  return styles.notAttempted;
}

export function StudentStudyLibraryView({
  studentName,
  courseName,
  sectionName,
  schoolYear,
  guides,
  courseOptions = [],
  selectedSectionId,
  courseActionPath,
  preview = false,
  previewLabel,
  previewHeaderActions,
  previewStudents = [],
  previewStudentId,
  previewActionPath = "/student/preview/study-library",
  previewCarryFields = [],
}: StudentStudyLibraryViewProps) {
  const retakeCount = guides.filter((guide) => guide.status === "Retake available").length;
  const recommendedCount = guides.filter((guide) => guide.recommendedCount > 0).length;
  const availableResourceCount = guides.reduce((sum, guide) => sum + guide.resourceCount, 0);

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Study Library</p>
        <h1>{courseName}</h1>
        <p className="subtle">{studentName} • {sectionName} • {schoolYear}</p>
        {preview ? previewHeaderActions : null}
      </div>
    </header>
    {preview ? <TeacherPrimaryNav/> : <StudentPrimaryNav/>}

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div><span>Teacher preview</span><small>{previewLabel ?? "This simulates the Study Library available to the selected student."}</small></div>
        {previewStudents.length > 0 && previewStudentId ? <form method="get" action={previewActionPath}>
          {previewCarryFields.map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          <label><span className="subtle">Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
          <button className="secondary-link" type="submit">Switch</button>
        </form> : null}
      </div> : null}

      <article className={`panel ${styles.toolbar}`}>
        <div><p className="eyebrow">Study / Retake Preparation</p><h2>Choose what you want to work on</h2><p className="subtle">Open an assessment to review the skills, practice links, notes, and other resources currently available to you.</p></div>
        {courseOptions.length > 1 ? <form method="get" action={courseActionPath}>
          {preview && previewStudentId ? <input type="hidden" name="studentId" value={previewStudentId}/> : null}
          <label>Course<select name="sectionId" defaultValue={selectedSectionId}>{courseOptions.map((option) => <option key={option.sectionId} value={option.sectionId}>{option.label}</option>)}</select></label>
          <button className="primary-button" type="submit">Switch Course</button>
        </form> : null}
      </article>

      <section className={styles.summaryGrid} aria-label="Study summary">
        <article className={styles.summaryCard}><span>Study guides</span><strong>{guides.length}</strong><small>Available in this course</small></article>
        <article className={styles.summaryCard}><span>Retakes available</span><strong>{retakeCount}</strong><small>Assessments you can revisit</small></article>
        <article className={styles.summaryCard}><span>Resources available now</span><strong>{availableResourceCount}</strong><small>{recommendedCount} guide{recommendedCount === 1 ? " has" : "s have"} recommended practice</small></article>
      </section>

      <section className={styles.guideGrid} aria-label="Available study guides">
        {guides.length ? guides.map((guide) => <article className={styles.guideCard} key={guide.assignmentId}>
          <div className={styles.guideTop}>
            <div><p className="eyebrow">{guide.date ?? "Assessment"}</p><h3>{guide.title}</h3><p>{guide.guideTitle}</p></div>
            <div style={{ display: "grid", gap: 6, justifyItems: "end" }}>
              <span className={`${styles.status} ${statusClass(guide.status)}`}>{guide.status}</span>
              {guide.draft ? <span className={`${styles.status} ${styles.draft}`}>Draft preview</span> : null}
            </div>
          </div>
          {guide.description ? <p className="subtle">{guide.description}</p> : null}
          <div className={styles.meta}>
            <span><BookOpen size={13}/> {guide.skillCount} skill{guide.skillCount === 1 ? "" : "s"}</span>
            <span>{guide.resourceCount} resource{guide.resourceCount === 1 ? "" : "s"} now</span>
            <span>{guide.attemptCount} attempt{guide.attemptCount === 1 ? "" : "s"}</span>
            {guide.recommendedCount ? <span><Star size={13}/> {guide.recommendedCount} recommended first</span> : null}
          </div>
          <div className={styles.guideFooter}><span className="subtle">Open this guide for skill-by-skill study resources and attempt history.</span><Link className="primary-button" href={guide.href}>Open Study Guide</Link></div>
        </article>) : <div className={styles.empty}>No study guides are available for this course yet. Published guides will appear here automatically.</div>}
      </section>
    </section>
  </main>;
}
