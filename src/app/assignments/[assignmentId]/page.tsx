import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2, Edit3 } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { GradeEntryGrid } from "./grade-entry-grid";

function safeReturnPath(value: string | undefined) {
  if (!value || value.startsWith("//")) return "/gradebook/assignments";
  if (value.startsWith("/gradebook/assignments") || value === "/assignments" || value.startsWith("/assignments?")) return value;
  return "/gradebook/assignments";
}

export default async function AssignmentGradePage({ params, searchParams }: { params: Promise<{ assignmentId: string }>; searchParams: Promise<{ returnTo?: string; published?: string }> }) {
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
  const [roster, typeResult, categoryResult, linkedResult] = await Promise.all([
    getSectionRoster(section.sectionId, "active"),
    supabase.from("assignment_types").select("name").eq("id", assignment.assignment_type_id).maybeSingle(),
    supabase.from("grading_categories").select("name").eq("id", assignment.category_id).maybeSingle(),
    assignment.link_group_id
      ? supabase.from("assignments").select("id,section_id").eq("link_group_id", assignment.link_group_id).eq("archived", false)
      : Promise.resolve({ data: [] as { id: string; section_id: string }[], error: null }),
  ]);
  const assignmentTypeLabel = typeResult.data?.name ?? assignment.assignment_type;
  const categoryLabel = categoryResult.data?.name ?? "Uncategorized";
  const linkedAssignments = (linkedResult.data ?? []).flatMap((linked) => {
    const linkedSection = sections.find((item) => item.sectionId === linked.section_id);
    return linkedSection ? [{ assignmentId: linked.id, section: linkedSection }] : [];
  }).sort((a, b) => (a.section.periodNumber ?? 999) - (b.section.periodNumber ?? 999) || a.section.sectionName.localeCompare(b.section.sectionName));

  const { data: records } = await supabase.from("grade_records").select("id,student_id,missing").eq("assignment_id", assignmentId);
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
      attempts: studentAttempts,
    };
  });

  const backLabel = returnTo.startsWith("/assignments") ? "Back to Assignments" : "Back to Assignment Gradebook";
  const editHref = `/assignments/${assignmentId}/edit?returnTo=${encodeURIComponent(returnTo.startsWith("/assignments") ? returnTo : "/assignments")}`;
  const publishedCount = Number(query.published ?? 0);

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Grade Entry</p><h1>{assignment.title}</h1><p className="subtle">{assignment.assignment_date} • {assignment.points_possible} points • {assignmentTypeLabel} → {categoryLabel}{assignment.allow_retakes ? " • Retakes allowed" : " • Single attempt"}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/assignments"/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      {publishedCount > 1 ? <div className="import-message success"><strong>Assignment published to {publishedCount} sections.</strong> Each section has its own grade records.</div> : null}
      {linkedAssignments.length > 1 ? <article className="panel" style={{ marginBottom: 16 }}><div className="panel-header"><div><p className="eyebrow">Linked assignment</p><h3>Grade each section separately</h3><p className="subtle">These records were created together and are explicitly linked as the same course assignment.</p></div><div className="toolbar-group">{linkedAssignments.map((linked) => <Link key={linked.assignmentId} className={linked.assignmentId === assignmentId ? "primary-button" : "secondary-link"} href={`/assignments/${linked.assignmentId}`}>{linked.section.sectionName}</Link>)}</div></div></article> : null}
      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">Active roster</p><h2>{roster.length} students</h2><p className="subtle">Enter scores directly. Changes save automatically and are recorded in grade history.</p></div><div className="grade-audit-header-actions"><Link className="secondary-link" href={returnTo}><ArrowLeft size={17}/> {backLabel}</Link><Link className="secondary-link" href={editHref}><Edit3 size={16}/> Edit Assignment</Link><Link className="secondary-link" href="/assignments/new">New assignment</Link><span className="status success-pill"><CheckCircle2 size={14}/> Autosave on</span></div></div>
        <GradeEntryGrid assignmentId={assignmentId} pointsPossible={Number(assignment.points_possible)} allowRetakes={assignment.allow_retakes} students={students}/>
      </article>
    </section>
  </main>;
}
