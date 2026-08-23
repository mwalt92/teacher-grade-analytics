import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, CheckCircle2 } from "lucide-react";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

export default async function AssignmentGradePage({ params }: { params: Promise<{ assignmentId: string }> }) {
  const { assignmentId } = await params;
  const sections = await getTeacherSections();
  if (!sections.length) redirect("/");
  const supabase = await createClient();
  const { data: assignment } = await supabase.from("assignments").select("id,section_id,title,assignment_type,assignment_date,points_possible,allow_retakes").eq("id", assignmentId).maybeSingle();
  if (!assignment || !sections.some((section) => section.sectionId === assignment.section_id)) notFound();
  const section = sections.find((item) => item.sectionId === assignment.section_id)!;
  const roster = await getSectionRoster(section.sectionId, "active");

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Grade Entry</p><h1>{assignment.title}</h1><p className="subtle">{assignment.assignment_date} • {assignment.points_possible} points • {assignment.assignment_type}</p></div><Link className="secondary-link" href="/assignments/new"><ArrowLeft size={17}/> New assignment</Link></header>
    <section className="content-wrap">
      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">Assignment created</p><h2>{roster.length} active students ready</h2><p className="subtle">The assignment is safely stored in Supabase. This is the handoff point for the autosaving grade-entry grid.</p></div><span className="status success-pill"><CheckCircle2 size={14}/> Saved</span></div>
        <div className="grade-entry-placeholder">
          {roster.map((student) => <div className="grade-placeholder-row" key={student.enrollmentId}><strong>{student.displayName}</strong><span>{student.externalStudentKey}</span><span className="subtle">Score entry coming next</span></div>)}
        </div>
      </article>
    </section>
  </main>;
}
