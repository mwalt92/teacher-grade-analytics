import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Calculator, Eye, Mail, UserRound } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionGradingPeriods, getStudentPeriodCalculation, type StudentPeriodCalculation } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import type { GradeAuditLine, GradingRules } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";
import { StudentAssignmentEditor } from "./student-assignment-editor";
import { StudentProfileNavigator } from "./student-profile-navigator";
import styles from "./student-profile.module.css";

type PageProps = {
  params: Promise<{ studentId: string }>;
  searchParams: Promise<{ period?: string; sectionId?: string; returnTo?: string }>;
};

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function safeReturnPath(value: string | undefined) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/students";
  return value;
}

function categoryLabel(category: string, rules: GradingRules) {
  return rules.categoryLabels?.[category] ?? category;
}

function collectAuditLines(calculation: StudentPeriodCalculation): GradeAuditLine[] {
  if (calculation.mode === "direct") return calculation.result.audit;
  return calculation.components.flatMap((component) => collectAuditLines(component.calculation));
}

function profileHref(studentId: string, sectionId: string, period: string | undefined, returnTo: string) {
  const params = new URLSearchParams({ sectionId, returnTo });
  if (period) params.set("period", period);
  return `/students/${studentId}?${params.toString()}`;
}

export default async function StudentProfilePage({ params, searchParams }: PageProps) {
  const [{ studentId }, query] = await Promise.all([params, searchParams]);
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, activeSection] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!activeSection || !sections.length) redirect("/");
  const section = sections.find((candidate) => candidate.sectionId === query.sectionId) ?? activeSection;
  const roster = await getSectionRoster(section.sectionId, "all");
  const student = roster.find((candidate) => candidate.studentId === studentId);
  if (!student) notFound();

  const returnTo = safeReturnPath(query.returnTo);
  const periods = await getSectionGradingPeriods(section.sectionId);
  const calculations = await Promise.all(periods.map(async (period) => ({
    period,
    calculation: await getStudentPeriodCalculation(section.sectionId, student.studentId, period.code),
  })));
  const selectedPeriod = periods.find((period) => period.code === query.period) ?? periods[0] ?? null;
  const selectedCalculation = selectedPeriod
    ? calculations.find((item) => item.period.code === selectedPeriod.code)?.calculation ?? null
    : null;
  const selectedAudit = selectedCalculation ? collectAuditLines(selectedCalculation) : [];
  const missingCount = selectedAudit.filter((line) => line.status === "missing").length;
  const unenteredCount = selectedAudit.filter((line) => line.status === "unentered").length;
  const droppedCount = selectedAudit.filter((line) => line.status === "dropped").length;
  const retakeCount = selectedAudit.filter((line) => line.attempts.length > 1).length;

  const currentIndex = roster.findIndex((candidate) => candidate.studentId === student.studentId);
  const previousStudent = currentIndex > 0 ? roster[currentIndex - 1] : null;
  const nextStudent = currentIndex >= 0 && currentIndex < roster.length - 1 ? roster[currentIndex + 1] : null;
  const navigatorStudents = roster.map((candidate) => ({
    studentId: candidate.studentId,
    displayName: candidate.displayName,
    href: profileHref(candidate.studentId, section.sectionId, selectedPeriod?.code, returnTo),
  }));
  const previousHref = previousStudent ? profileHref(previousStudent.studentId, section.sectionId, selectedPeriod?.code, returnTo) : null;
  const nextHref = nextStudent ? profileHref(nextStudent.studentId, section.sectionId, selectedPeriod?.code, returnTo) : null;

  const courseLabel = section.courseCode && !section.courseName.toLowerCase().includes(section.courseCode.toLowerCase())
    ? `${section.courseName} ${section.courseCode}`
    : section.courseName;
  const currentProfileHref = profileHref(student.studentId, section.sectionId, selectedPeriod?.code, returnTo);
  const previewParams = new URLSearchParams({
    studentId: student.studentId,
    sectionId: section.sectionId,
    anchorSectionId: section.sectionId,
    view: "course",
  });
  if (selectedPeriod) previewParams.set("period", selectedPeriod.code);
  const auditHref = selectedPeriod
    ? `/gradebook/audit?studentId=${encodeURIComponent(student.studentId)}&period=${encodeURIComponent(selectedPeriod.code)}`
    : `/gradebook/audit?studentId=${encodeURIComponent(student.studentId)}`;

  const editableRows = selectedCalculation ? selectedAudit.map((line) => ({
    assignmentId: line.assignmentId,
    title: line.assignmentTitle ?? "Assignment",
    assignmentDate: line.assignmentDate ?? null,
    categoryLabel: categoryLabel(line.category, selectedCalculation.rules),
    gradingPeriodCode: line.gradingPeriodCode ?? selectedPeriod?.code ?? "",
    pointsPossible: line.pointsPossible,
    status: line.status,
    attemptOnePoints: line.attempts.find((attempt) => attempt.attemptNumber === 1)?.earned ?? null,
    missing: line.missing,
    exempt: line.exempt,
    attempts: line.attempts.map((attempt) => ({
      attemptNumber: attempt.attemptNumber,
      earned: attempt.earned,
      possible: attempt.possible,
      counted: attempt.counted,
    })),
  })) : [];

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Student Profile</p>
        <h1>{courseLabel}</h1>
        <p className="subtle">{section.sectionName} • {section.schoolYearLabel}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/students"/>
      </div>
    </header>
    <TeacherPrimaryNav/>

    <section className={`content-wrap ${styles.content}`}>
      <div className={styles.backRow}><Link className="secondary-link" href={returnTo}><ArrowLeft size={17}/> Back</Link></div>
      <StudentProfileNavigator students={navigatorStudents} currentStudentId={student.studentId} previousHref={previousHref} nextHref={nextHref}/>

      <div className={styles.profileHeader}>
        <div className={styles.identity}>
          <p className="eyebrow">Student record</p>
          <h2>{student.displayName}</h2>
          <div className={styles.identityMeta}>
            <span className={student.active ? "status success-pill" : "status neutral-pill"}>{student.active ? "Active" : "Inactive"}</span>
            {student.externalStudentKey ? <span><UserRound size={14}/> Student #{student.externalStudentKey}</span> : null}
            {student.email ? <span><Mail size={14}/> {student.email}</span> : null}
          </div>
        </div>
        <div className={styles.headerActions}>
          <Link className="secondary-link" href={`/student/preview?${previewParams.toString()}`}><Eye size={16}/> Preview as Student</Link>
          <Link className="secondary-link" href={auditHref}><Calculator size={16}/> Grade Audit</Link>
        </div>
      </div>

      {periods.length ? <section className={styles.periodOverview} aria-label="Student grading periods">
        {calculations.map(({ period, calculation }) => <Link
          className={period.code === selectedPeriod?.code ? styles.periodCardActive : styles.periodCard}
          href={profileHref(student.studentId, section.sectionId, period.code, returnTo)}
          key={period.id}
        >
          <span>{period.code} • {period.calculationMode === "composite" ? "Composite" : period.periodRole === "exam" ? "Exam" : "Direct"}</span>
          <strong>{formatPercent(calculation?.result.overallPercent ?? null)}</strong>
          <small>{period.name}</small>
        </Link>)}
      </section> : null}

      {selectedPeriod && selectedCalculation ? <>
        <section className={`metric-grid ${styles.metricGrid}`} aria-label="Selected student grade summary">
          <article className="metric-card"><span className="metric-label">Current {selectedPeriod.code}</span><strong>{formatPercent(selectedCalculation.result.overallPercent)}</strong></article>
          <article className="metric-card"><span className="metric-label">Missing</span><strong>{missingCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Unentered</span><strong>{unenteredCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Retake activity</span><strong>{retakeCount}</strong></article>
          <article className="metric-card"><span className="metric-label">Dropped</span><strong>{droppedCount}</strong></article>
        </section>

        <section className={styles.detailGrid}>
          <article className="panel">
            <div className="panel-header"><div><p className="eyebrow">Grade breakdown</p><h3>{selectedPeriod.code} — {selectedPeriod.name}</h3></div></div>
            {selectedCalculation.mode === "direct" ? <div className={styles.categoryList}>
              {Object.values(selectedCalculation.result.categories).length ? Object.values(selectedCalculation.result.categories).map((category) => <div className={styles.categoryRow} key={category.category}>
                <div><strong>{category.label}</strong><small>{Math.round(category.configuredWeight * 100)}% configured weight • {category.assignmentCount} counting • {category.droppedCount} dropped</small></div>
                <strong>{formatPercent(category.averagePercent)}</strong>
              </div>) : <div className={styles.empty}>No category grade data is available yet.</div>}
            </div> : <div className={styles.componentList}>
              {selectedCalculation.result.components.map((component) => <div className={styles.componentRow} key={component.code}>
                <div><strong>{component.code} — {component.label}</strong><small>{Math.round(component.weight * 100)}% configured weight{component.percent === null ? " • currently excluded" : ""}</small></div>
                <strong>{formatPercent(component.percent)}</strong>
              </div>)}
            </div>}
          </article>

          <aside className="panel">
            <div className="panel-header"><div><p className="eyebrow">Needs attention</p><h3>Workload signals</h3></div></div>
            <div className={styles.attentionStack}>
              <div className={`${styles.attentionItem} ${missingCount ? styles.warningItem : ""}`}><span>Missing assignments</span><strong>{missingCount}</strong></div>
              <div className={`${styles.attentionItem} ${unenteredCount ? styles.warningItem : ""}`}><span>Unentered assignments</span><strong>{unenteredCount}</strong></div>
              <div className={styles.attentionItem}><span>Assignments with multiple attempts</span><strong>{retakeCount}</strong></div>
              <div className={styles.attentionItem}><span>Dropped assignments</span><strong>{droppedCount}</strong></div>
            </div>
          </aside>
        </section>

        <article className={`panel full-width ${styles.tablePanel}`}>
          <div className="panel-header"><div><p className="eyebrow">Assignment grades</p><h3>Grade {student.displayName} in {selectedPeriod.code}</h3><p className="subtle">Edit this student's original assignment scores directly here. Missing and Exempt use the same rules as normal grade entry; existing retake attempts remain visible for context.</p></div><Link className="secondary-link" href={auditHref}>Open calculation details</Link></div>
          {editableRows.length ? <StudentAssignmentEditor studentId={student.studentId} rows={editableRows} profileHref={currentProfileHref}/> : <div className={styles.empty}>No assignments are configured in this grading period yet.</div>}
        </article>
      </> : <article className="panel"><h2>No grading periods are configured yet.</h2><p className="subtle">Once grading periods exist, this profile will show the student's complete grade picture here.</p></article>}
    </section>
  </main>;
}
