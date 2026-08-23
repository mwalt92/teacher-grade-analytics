import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { GradeEntryGrid } from "./grade-entry-grid";

export default async function AssignmentGradePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");
  const supabase = await createClient();
  const { data: assignment } = await supabase.from("assignments").select("id,section_id,title,assignment_type,assignment_date,points_possible,allow_retakes").eq("id", assignmentId).maybeSingle();
  if (!assignment || !sections.some((section) => section.sectionId === assignment.section_id)) notFound();
  const section = sections.find((item) => item.sectionId === assignment.section_id)!;
  const roster = await getSectionRoster(section.sectionId, "active");

  const { data: records } = await supabase.from("grade_records").select("id,student_id,missing").eq("assignment_id", assignmentId);
  const recordIds = (records ?? []).map((record) => record.id);
  const { data: attempts } = recordIds.length
    ? await supabase.from("grade_attempts").select("grade_record_id,attempt_number,points_earned").in("grade_record_id", recordIds).eq("attempt_number", 1)
    : { data: [] as { grade_record_id: string; attempt_number: number; points_earned: number }[] };
  const attemptByRecord = new Map((attempts ?? []).map((attempt) => [attempt.grade_record_id, attempt]));
  const recordByStudent = new Map((records ?? []).map((record) => [record.student_id, record]));
  const students = roster.map((student) => {
    const record = recordByStudent.get(student.studentId);
    const attemptOne = record ? attemptByRecord.get(record.id) : undefined;
    return {
      studentId: student.studentId,
      displayName: student.displayName,
      externalStudentKey: student.externalStudentKey,
      points: attemptOne ? Number(attemptOne.points_earned) : null,
      missing: record?.missing ?? false,
    };
  });

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Grade Entry</p><h1>{assignment.title}</h1><p className="subtle">{assignment.assignment_date} • {assignment.points_possible} points • {assignment.assignment_type}</p></div><Link className="secondary-link" href="/assignments/new"><ArrowLeft size={17}/> New assignment</Link></header>
    <section className="content-wrap">
      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">Active roster</p><h2>{roster.length} students</h2><p className="subtle">Enter scores directly. Changes save automatically and are recorded in grade history.</p></div><span className="status success-pill"><CheckCircle2 size={14}/> Autosave on</span></div>
        <GradeEntryGrid assignmentId={assignmentId} pointsPossible={Number(assignment.points_possible)} students={students}/>
      </article>
    </section>
  </main>;
}
