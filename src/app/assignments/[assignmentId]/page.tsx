import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BookOpen, CheckCircle2, Edit3 } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentNavigator } from "./assignment-navigator";
import { GradeEntryGrid } from "./grade-entry-grid";
import styles from "./grade-entry.module.css";

function safeReturnPath(value: string | undefined) {
  if (!value || value.startsWith("//")) return "/gradebook/assignments";
  if (value.startsWith("/gradebook/assignments") || value === "/assignments" || value.startsWith("/assignments?")) return value;
  return "/gradebook/assignments";
}

function assignmentHref(assignmentId: string, returnTo: string, scope?: "section") {
  const params = new URLSearchParams();
  params.set("returnTo", returnTo);
  if (scope) params.set("scope", scope);
  return `/assignments/${assignmentId}?${params.toString()}`;
}

function sectionDisplay(section: { sectionName: string; periodNumber: number | null }) {
  if (section.periodNumber == null) return section.sectionName;
  const periodText = String(section.periodNumber);
  return section.sectionName.includes(periodText) ? section.sectionName : `${section.sectionName} • Period ${section.periodNumber}`;
}

export default async function AssignmentGradePage({ params, searchParams }: {
  params: Promise<{ assignmentId: string }>;
  searchParams: Promise<{ returnTo?: string; published?: string; scope?: string }>;
}) {
  const [{ assignmentId }, query] = await Promise.all([params, searchParams]);
  const returnTo = safeReturnPath(query.returnTo);
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");
  const supabase = await createClient();
  const { data: assignment } = await supabase.from("assignments").select("id,section_id,link_group_id,title,assignment_type,assignment_type_id,category_id,assignment_date,points_possible,allow_retakes,archived").eq("id", assignmentId).maybeSingle();
  if (!assignment || !sections.some((section) => section.sectionId === assignment.section_id)) notFound();
  if (assignment.archived) {
    const editUrl = new URL(`/assignments/${assignmentId}/edit`, "https://teacher-grade-analytics.local");
    editUrl.searchParams.set("returnTo", returnTo.startsWith("/assignments") ? returnTo : "/assignments?status=archived");
    editUrl.searchParams.set("error", "Restore this assignment before changing student grades.");
    redirect(`${editUrl.pathname}${editUrl.search}`);
  }

  const section = sections.find((item) => item.sectionId === assignment.section_id)!;
  const offeringSections = sections
    .filter((item) => item.offeringId === section.offeringId)
    .sort((a, b) => (a.periodNumber ?? 999) - (b.periodNumber ?? 999) || a.sortOrder - b.sortOrder || a.sectionName.localeCompare(b.sectionName));
  const offeringSectionIds = offeringSections.map((item) => item.sectionId);

  const [typeResult, categoryResult, linkedResult, siblingResult] = await Promise.all([
    supabase.from("assignment_types").select("name").eq("id", assignment.assignment_type_id).maybeSingle(),
    supabase.from("grading_categories").select("name").eq("id", assignment.category_id).maybeSingle(),
    assignment.link_group_id
      ? supabase.from("assignments").select("id,section_id").eq("link_group_id", assignment.link_group_id).eq("archived", false)
      : Promise.resolve({ data: [{ id: assignment.id, section_id: assignment.section_id }], error: null }),
    offeringSectionIds.length
      ? supabase.from("assignments").select("id,section_id,link_group_id,title,assignment_date").in("section_id", offeringSectionIds).eq("archived", false).order("assignment_date", { ascending: true }).order("title")
      : Promise.resolve({ data: [], error: null }),
  ]);

  const assignmentTypeLabel = typeResult.data?.name ?? assignment.assignment_type;
  const categoryLabel = categoryResult.data?.name ?? "Uncategorized";
  const linkedAssignments = (linkedResult.data ?? []).flatMap((linked) => {
    const linkedSection = sections.find((item) => item.sectionId === linked.section_id);
    return linkedSection ? [{ assignmentId: linked.id, section: linkedSection }] : [];
  }).sort((a, b) => (a.section.periodNumber ?? 999) - (b.section.periodNumber ?? 999) || a.section.sortOrder - b.section.sortOrder || a.section.sectionName.localeCompare(b.section.sectionName));

  const showAllHours = linkedAssignments.length > 1 && query.scope !== "section";
  const visibleLinkedAssignments = showAllHours
    ? linkedAssignments
    : linkedAssignments.filter((item) => item.assignmentId === assignmentId);

  async function loadGradeEntryView(linked: (typeof linkedAssignments)[number]) {
    const roster = await getSectionRoster(linked.section.sectionId, "active");
    const { data: records } = await supabase.from("grade_records").select("id,student_id,missing,exempt").eq("assignment_id", linked.assignmentId);
    const recordIds = (records ?? []).map((record) => record.id);
    const { data: attempts } = recordIds.length
      ? await supabase.from("grade_attempts").select("grade_record_id,attempt_number,points_earned,occurred_on").in("grade_record_id", recordIds).order("attempt_number", { ascending: true })
      : { data: [] as { grade_record_id: string; attempt_number: number; points_earned: number; occurred_on: string }[] };
    const attemptsByRecord = new Map<string, { attemptNumber: number; points: number; occurredOn: string }[]>();
    for (const attempt of attempts ?? []) {
      const list = attemptsByRecord.get(attempt.grade_record_id) ?? [];
      list.push({ attemptNumber: attempt.attempt_number, points: Number(attempt.points_earned), occurredOn: attempt.occurred_on });
      attemptsByRecord.set(attempt.grade_record_id, list);
    }
    const recordByStudent = new Map((records ?? []).map((record) => [record.student_id, record]));
    const students = roster.map((student) => {
      const record = recordByStudent.get(student.studentId);
      const studentAttempts = record ? attemptsByRecord.get(record.id) ?? [] : [];
      const attemptOne = studentAttempts.find((attempt) => attempt.attemptNumber === 1);
      return {
        studentId: student.studentId,
        displayName: student.displayName,
        externalStudentKey: student.externalStudentKey,
        points: attemptOne?.points ?? null,
        missing: record?.missing ?? false,
        exempt: record?.exempt ?? false,
        attempts: studentAttempts,
      };
    });
    return { ...linked, students };
  }

  const gradeEntryViews = await Promise.all(visibleLinkedAssignments.map(loadGradeEntryView));

  const groupMap = new Map<string, { id: string; sectionId: string; linkGroupId: string | null; title: string; assignmentDate: string }[]>();
  for (const item of siblingResult.data ?? []) {
    const key = item.link_group_id ? `linked:${item.link_group_id}` : `single:${item.id}`;
    const list = groupMap.get(key) ?? [];
    list.push({ id: item.id, sectionId: item.section_id, linkGroupId: item.link_group_id, title: item.title, assignmentDate: item.assignment_date });
    groupMap.set(key, list);
  }
  const assignmentGroups = [...groupMap.entries()].map(([key, items]) => {
    const sortedItems = [...items].sort((a, b) => {
      const aSection = sections.find((candidate) => candidate.sectionId === a.sectionId);
      const bSection = sections.find((candidate) => candidate.sectionId === b.sectionId);
      return (aSection?.periodNumber ?? 999) - (bSection?.periodNumber ?? 999) || (aSection?.sortOrder ?? 999) - (bSection?.sortOrder ?? 999);
    });
    return { key, items: sortedItems, representative: sortedItems[0] };
  }).sort((a, b) => a.representative.assignmentDate.localeCompare(b.representative.assignmentDate) || a.representative.title.localeCompare(b.representative.title));

  const currentGroupKey = assignment.link_group_id ? `linked:${assignment.link_group_id}` : `single:${assignment.id}`;
  const navigatorItems = assignmentGroups.map((group) => ({
    key: group.key,
    label: `${group.representative.assignmentDate} • ${group.representative.title}`,
    href: assignmentHref(group.representative.id, returnTo),
  }));
  const currentGroupIndex = assignmentGroups.findIndex((group) => group.key === currentGroupKey);
  const previousHref = currentGroupIndex > 0 ? assignmentHref(assignmentGroups[currentGroupIndex - 1].representative.id, returnTo) : null;
  const nextHref = currentGroupIndex >= 0 && currentGroupIndex < assignmentGroups.length - 1 ? assignmentHref(assignmentGroups[currentGroupIndex + 1].representative.id, returnTo) : null;

  const editHref = `/assignments/${assignmentId}/edit?returnTo=${encodeURIComponent(returnTo.startsWith("/assignments") ? returnTo : "/assignments")}`;
  const publishedCount = Number(query.published ?? 0);
  const totalVisibleStudents = gradeEntryViews.reduce((sum, view) => sum + view.students.length, 0);
  const currentGradeEntryHref = assignmentHref(assignmentId, returnTo, query.scope === "section" ? "section" : undefined);

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Grade Entry</p><h1>{assignment.title}</h1><p className="subtle">{assignment.assignment_date} • {assignment.points_possible} points • {assignmentTypeLabel} → {categoryLabel}{assignment.allow_retakes ? " • Retakes allowed" : " • Single attempt"}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/assignments"/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <AssignmentNavigator items={navigatorItems} currentKey={currentGroupKey} previousHref={previousHref} nextHref={nextHref}/>

      {linkedAssignments.length > 1 ? <section className={styles.hourScope} aria-label="Assignment section view">
        <div className={styles.hourScopeIntro}>
          <div><strong>{showAllHours ? "All Hours" : sectionDisplay(section)}</strong><span>{showAllHours ? `${totalVisibleStudents} students across ${linkedAssignments.length} sections. Scroll continuously from the earliest hour to the latest.` : "Showing one section of this linked assignment."}</span></div>
          <nav className={styles.hourButtons} aria-label="Choose assignment hour">
            <Link className={showAllHours ? styles.hourButtonActive : styles.hourButton} href={assignmentHref(assignmentId, returnTo)}>All Hours</Link>
            {linkedAssignments.map((linked) => <Link
              key={linked.assignmentId}
              className={!showAllHours && linked.assignmentId === assignmentId ? styles.hourButtonActive : styles.hourButton}
              href={assignmentHref(linked.assignmentId, returnTo, "section")}
            >{sectionDisplay(linked.section)}</Link>)}
          </nav>
        </div>
      </section> : null}

      {publishedCount > 1 ? <div className="import-message success"><strong>Assignment published to {publishedCount} sections.</strong> Each section has its own grade records.</div> : null}

      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">{showAllHours ? "Linked assignment roster" : "Active roster"}</p><h2>{showAllHours ? `${totalVisibleStudents} students across ${gradeEntryViews.length} hours` : `${gradeEntryViews[0]?.students.length ?? 0} students`}</h2><p className="subtle">Enter scores directly. Changes save automatically and are recorded in grade history. Bulk actions remain hour-specific in All Hours view.</p></div><div className="grade-audit-header-actions"><Link className="secondary-link" href={`/assignments/${assignmentId}/study`}><BookOpen size={16}/> Study Resources</Link><Link className="secondary-link" href={editHref}><Edit3 size={16}/> Edit Assignment</Link><span className="status success-pill"><CheckCircle2 size={14}/> Autosave on</span></div></div>

        {showAllHours ? <div className={styles.linkedSectionStack}>
          {gradeEntryViews.map((view, index) => <section className={styles.linkedSectionBlock} id={`hour-${view.section.sectionId}`} key={view.assignmentId}>
            <div className={styles.linkedSectionBanner}>
              <div><span>Hour {index + 1} of {gradeEntryViews.length}</span><strong>{sectionDisplay(view.section)}</strong><small>{view.students.length} active {view.students.length === 1 ? "student" : "students"}</small></div>
              <Link className="secondary-link" href={assignmentHref(view.assignmentId, returnTo, "section")}>View only this hour</Link>
            </div>
            <GradeEntryGrid assignmentId={view.assignmentId} pointsPossible={Number(assignment.points_possible)} allowRetakes={assignment.allow_retakes} students={view.students} sectionId={view.section.sectionId} profileReturnTo={currentGradeEntryHref}/>
          </section>)}
        </div> : gradeEntryViews[0] ? <GradeEntryGrid assignmentId={gradeEntryViews[0].assignmentId} pointsPossible={Number(assignment.points_possible)} allowRetakes={assignment.allow_retakes} students={gradeEntryViews[0].students} sectionId={gradeEntryViews[0].section.sectionId} profileReturnTo={currentGradeEntryHref}/> : null}
      </article>
    </section>
  </main>;
}
