import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentForm } from "../assignment-form";

export default async function NewAssignmentPage() {
  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) redirect("/");
  const supabase = await createClient();
  const { data: periods } = await supabase.from("grading_periods").select("id,code,name").eq("section_id", section.sectionId).order("code");
  const today = new Date().toISOString().slice(0, 10);

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Teacher Grade Analytics</p><h1>Assignment Creation</h1><p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p></div>
      <Link className="secondary-link" href="/"><ArrowLeft size={17}/> Dashboard</Link>
    </header>
    <section className="content-wrap assignment-create-wrap">
      <article className="panel">
        <div className="panel-header"><div><p className="eyebrow">New assignment</p><h2>What are you entering?</h2><p className="subtle">Choose the workflow first. The grade-entry screen will open immediately after creation.</p></div></div>
        <AssignmentForm sectionId={section.sectionId} periods={periods ?? []} today={today}/>
      </article>
    </section>
  </main>;
}
