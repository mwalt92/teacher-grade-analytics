"use client";

import { Archive, BookOpenCheck, FileText, RotateCcw, Users } from "lucide-react";
import { setActiveTeacherSection } from "@/app/teacher-section-actions";
import { setCourseOfferingArchived } from "./actions";
import styles from "./course-lifecycle.module.css";

type CourseOffering = {
  offeringId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
  active: boolean;
  sections: {
    sectionId: string;
    sectionName: string;
    active: boolean;
    periodNumber: number | null;
    sortOrder: number;
  }[];
  activeSectionCount: number;
  enrollmentCount: number;
  activeEnrollmentCount: number;
  assignmentCount: number;
};

function displayCourseName(name: string, code: string | null) {
  if (!code || name.toLowerCase().includes(code.toLowerCase())) return name;
  return `${name} ${code}`;
}

export function CourseLifecycleList({ offerings, view }: { offerings: CourseOffering[]; view: "active" | "archived" }) {
  if (!offerings.length) {
    return <article className={`panel ${styles.empty}`}>
      <BookOpenCheck size={30}/>
      <h3>{view === "active" ? "No active courses" : "No archived courses"}</h3>
      <p className="subtle">{view === "active" ? "Create or restore a course to return it to everyday teaching workflows." : "Archived courses will appear here with all historical data preserved."}</p>
    </article>;
  }

  return <div className={styles.grid}>
    {offerings.map((offering) => {
      const firstActiveSection = offering.sections.find((section) => section.active);
      return <article className={`panel ${styles.card}`} key={offering.offeringId}>
        <div className={styles.cardHeader}>
          <div>
            <p className="eyebrow">{offering.schoolYearLabel}</p>
            <h3>{displayCourseName(offering.courseName, offering.courseCode)}</h3>
            <p className="subtle">{offering.sections.length} section{offering.sections.length === 1 ? "" : "s"} • {offering.activeSectionCount} active</p>
          </div>
          <span className={offering.active ? styles.activeBadge : styles.archivedBadge}>{offering.active ? "Active" : "Archived"}</span>
        </div>

        <div className={styles.metrics}>
          <div><Users size={16}/><span>Active students</span><strong>{offering.activeEnrollmentCount}</strong></div>
          <div><Users size={16}/><span>Historical enrollments</span><strong>{offering.enrollmentCount}</strong></div>
          <div><FileText size={16}/><span>Assignments</span><strong>{offering.assignmentCount}</strong></div>
        </div>

        <div className={styles.sectionList}>
          {offering.sections.map((section) => <span className={section.active ? styles.sectionChip : styles.inactiveSectionChip} key={section.sectionId}>{section.sectionName}{section.active ? "" : " · inactive"}</span>)}
        </div>

        <div className={styles.historyNote}>
          {offering.active
            ? "Archiving removes this course from Teacher Home and course switching. It does not delete sections, rosters, assignments, grades, attempts, or history."
            : "This course is hidden from everyday teaching workflows. Restore it to make its active sections available again."}
        </div>

        <div className={styles.actions}>
          {offering.active && firstActiveSection ? <form action={setActiveTeacherSection}>
            <input type="hidden" name="sectionId" value={firstActiveSection.sectionId}/>
            <input type="hidden" name="returnTo" value="/settings?area=course-sections"/>
            <button className="secondary-link" type="submit">Open settings</button>
          </form> : null}
          <form action={setCourseOfferingArchived} onSubmit={(event) => {
            const prompt = offering.active
              ? `Archive ${displayCourseName(offering.courseName, offering.courseCode)}?\n\nThe course will leave everyday views, but all historical data will remain intact.`
              : `Restore ${displayCourseName(offering.courseName, offering.courseCode)} to active teaching workflows?`;
            if (!window.confirm(prompt)) event.preventDefault();
          }}>
            <input type="hidden" name="offeringId" value={offering.offeringId}/>
            <input type="hidden" name="archived" value={offering.active ? "true" : "false"}/>
            <button className={offering.active ? styles.archiveButton : "primary-button"} type="submit">
              {offering.active ? <><Archive size={16}/> Archive course</> : <><RotateCcw size={16}/> Restore course</>}
            </button>
          </form>
        </div>
      </article>;
    })}
  </div>;
}
