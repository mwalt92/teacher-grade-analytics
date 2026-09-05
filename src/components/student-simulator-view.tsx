import type { ReactNode } from "react";
import { GradeSimulator } from "@/components/grade-simulator";
import { StudentPrimaryNav } from "@/components/student-primary-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import type { StudentDashboardData } from "@/lib/data/student-dashboard";
import styles from "./student-simulator-view.module.css";

type CourseOption = { sectionId: string; label: string };

type StudentSimulatorViewProps = {
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
  previewBannerActions?: ReactNode;
  previewStudents?: { studentId: string; displayName: string }[];
  previewStudentId?: string;
  previewActionPath?: string;
  dashboardHref?: string;
  gradesHref?: string;
  simulatorHref?: string;
  studyLibraryHref?: string;
};

export function StudentSimulatorView({
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
  previewBannerActions,
  previewStudents = [],
  previewStudentId,
  previewActionPath = "/student/preview/simulator",
  dashboardHref,
  gradesHref,
  simulatorHref,
  studyLibraryHref,
}: StudentSimulatorViewProps) {
  return <main className={`app-shell ${styles.shell}`}>
    <header className="topbar">
      <div>
        <p className="eyebrow">Student Grade Simulator</p>
        <h1>{courseName}</h1>
        <p className="subtle">{studentName} • {sectionName} • {schoolYear}</p>
        {preview ? previewHeaderActions : null}
      </div>
    </header>
    {preview ? <TeacherPrimaryNav/> : <StudentPrimaryNav dashboardHref={dashboardHref} gradesHref={gradesHref} simulatorHref={simulatorHref} studyLibraryHref={studyLibraryHref}/>}

    <section className={`content-wrap ${styles.content}`}>
      {preview ? <div className={styles.previewBanner}>
        <div><span>Teacher preview</span><small>{previewLabel ?? "This is the same Grade Simulator the selected student will use."}</small></div>
        <div className={styles.previewTools}>
          {previewStudents.length > 0 && previewStudentId ? <form method="get" action={previewActionPath} className={styles.previewForm}>
            {hiddenFields.filter((field) => field.name !== "studentId").map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
            <label><span>Preview student</span><select name="studentId" defaultValue={previewStudentId}>{previewStudents.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}</option>)}</select></label>
            <button className="secondary-link" type="submit">Switch</button>
          </form> : null}
          {previewBannerActions}
        </div>
      </div> : null}

      <article className={`panel ${styles.controls}`}>
        <div><p className="eyebrow">Simulation context</p><h2>Try a different grading period</h2><p className="subtle">Choose the course and grading period you want to model. Nothing you enter here changes a real grade.</p></div>
        <form method="get" action={actionPath} className={styles.filterForm}>
          {hiddenFields.filter((field) => field.name !== "sectionId" && field.name !== "period").map((field) => <input key={field.name} type="hidden" name={field.name} value={field.value}/>)}
          {courseOptions.length > 1 ? <label><span>Course</span><select name="sectionId" defaultValue={selectedSectionId}>{courseOptions.map((option) => <option key={option.sectionId} value={option.sectionId}>{option.label}</option>)}</select></label> : <input type="hidden" name="sectionId" value={selectedSectionId}/>} 
          <label><span>Grading period</span><select name="period" defaultValue={data.periodCode}>{data.availablePeriods.map((period) => <option key={period.code} value={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <button className="primary-button" type="submit">Load Simulator</button>
        </form>
      </article>

      <GradeSimulator data={data.simulator}/>
    </section>
  </main>;
}
