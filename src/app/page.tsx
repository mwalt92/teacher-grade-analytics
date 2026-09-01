import Link from "next/link";
import { redirect } from "next/navigation";
import { Archive, ArrowRight, BookOpenCheck, ClipboardPlus, RotateCcw, ShieldCheck, Users } from "lucide-react";
import { setActiveTeacherSection } from "@/app/teacher-section-actions";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { getTeacherHomeData } from "@/lib/data/teacher-home";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import styles from "./home/teacher-home.module.css";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(1)}%`;
}

export default async function TeacherHomePage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("display_name,role").eq("id", userId).maybeSingle();
  if (!profile) {
    return <main className="content-wrap"><article className="panel"><p className="eyebrow">Account setup</p><h1>Finishing your profile</h1><p className="subtle">Your Google account is authenticated, but the application profile has not been created yet. Refresh once and, if this persists, review the auth bootstrap configuration.</p></article></main>;
  }
  if (profile.role !== "teacher" && profile.role !== "admin") redirect("/student");

  const [sections, activeSection] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  const home = await getTeacherHomeData(sections);

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Teacher Home</h1>
        <p className="subtle">{profile.display_name} • Course-wide classroom snapshot</p>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className="content-wrap">
      <div className={styles.homeHeader}>
        <div>
          <p className="eyebrow">Your courses</p>
          <h2>What needs your attention today?</h2>
          <p className="subtle">Live summaries from the same canonical grade calculations used inside each course.</p>
        </div>
        <div className={styles.headingActions}>
          <Link className="secondary-link" href="/settings/courses"><Archive size={18}/> Manage Courses</Link>
          <Link className="primary-button" href="/settings/course-setup"><ClipboardPlus size={18}/> Create Course</Link>
        </div>
      </div>

      <section className={styles.summaryGrid} aria-label="Teacher course summary">
        <SummaryCard label="Active Courses" value={String(home.courseCount)}/>
        <SummaryCard label="Sections" value={String(home.sectionCount)}/>
        <SummaryCard label="Active Enrollments" value={String(home.activeEnrollmentCount)}/>
        <SummaryCard label="Missing Work" value={String(home.missingCount)}/>
        <SummaryCard label="PS Mismatches" value={String(home.powerSchoolMismatchCount)}/>
      </section>

      <section className={styles.courseGrid} aria-label="Active courses">
        {home.courses.length ? home.courses.map((course) => {
          const isCurrent = activeSection?.offeringId === course.offeringId;
          const preferredSection = isCurrent
            ? course.sections.find((section) => section.sectionId === activeSection?.sectionId) ?? course.sections[0]
            : course.sections[0];
          const courseReturnTo = course.sections.length > 1 ? "/dashboard?scope=all" : "/dashboard";
          const recentText = course.recentWorkTitle
            ? `Recent: ${course.recentWorkTitle}${course.recentWorkDate ? ` • ${course.recentWorkDate}` : ""}`
            : "No assignments in the current grading period yet.";

          return <article className={styles.courseCard} key={course.offeringId}>
            <div className={styles.courseHeader}>
              <div>
                <p className="eyebrow">{course.schoolYearLabel}</p>
                <h3 className={styles.courseTitle}>{displayCourseName(course.courseName, course.courseCode)}</h3>
                <p className={styles.courseMeta}>{course.sections.length} section{course.sections.length === 1 ? "" : "s"}{course.selectedPeriod ? ` • ${course.selectedPeriod.code} — ${course.selectedPeriod.name}` : " • No grading period configured"}</p>
              </div>
              {isCurrent ? <span className={styles.currentBadge}>Current course</span> : null}
            </div>

            <div className={styles.courseMetrics}>
              <CourseMetric icon={<Users size={16}/>} label="Students" value={String(course.studentCount)}/>
              <CourseMetric icon={<BookOpenCheck size={16}/>} label="Average" value={formatPercent(course.classAverage)}/>
              <CourseMetric icon={<ShieldCheck size={16}/>} label="Missing" value={String(course.missingCount)}/>
              <CourseMetric icon={<RotateCcw size={16}/>} label="Retakes" value={String(course.retakeCount)}/>
            </div>

            <div className={styles.courseStatus}>
              <p className={styles.statusText}><strong>{course.attentionCount}</strong> student{course.attentionCount === 1 ? "" : "s"} currently flagged for review • <strong>{course.powerSchoolMismatchCount}</strong> PowerSchool mismatch{course.powerSchoolMismatchCount === 1 ? "" : "es"}</p>
              <p className={styles.statusText}>{recentText}</p>
            </div>

            <div className={styles.courseFooter}>
              <div className={styles.sectionList} aria-label={`${course.courseName} sections`}>
                {course.sections.map((section) => <form className={styles.sectionForm} action={setActiveTeacherSection} key={section.sectionId}>
                  <input type="hidden" name="sectionId" value={section.sectionId}/>
                  <input type="hidden" name="returnTo" value="/dashboard"/>
                  <button className={styles.sectionButton} type="submit">{section.sectionName}</button>
                </form>)}
              </div>
              {preferredSection ? <form className={styles.openForm} action={setActiveTeacherSection}>
                <input type="hidden" name="sectionId" value={preferredSection.sectionId}/>
                <input type="hidden" name="returnTo" value={courseReturnTo}/>
                <button className="primary-button" type="submit">Open course <ArrowRight size={17}/></button>
              </form> : null}
            </div>
          </article>;
        }) : <article className={`panel ${styles.emptyPanel}`}>
          <BookOpenCheck size={30}/>
          <h3>No active courses yet</h3>
          <p className="subtle">Create a course or restore an archived course to return it to Teacher Home.</p>
          <div className={styles.headingActions}>
            <Link className="secondary-link" href="/settings/courses?view=archived"><Archive size={17}/> View archived courses</Link>
            <Link className="primary-button" href="/settings/course-setup"><ClipboardPlus size={17}/> Create Course</Link>
          </div>
        </article>}
      </section>
    </section>
  </main>;
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return <article className={styles.summaryCard}><span className={styles.summaryLabel}>{label}</span><strong className={styles.summaryValue}>{value}</strong></article>;
}

function CourseMetric({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className={styles.courseMetric}><span>{icon} {label}</span><strong>{value}</strong></div>;
}
