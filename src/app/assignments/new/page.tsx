import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentForm } from "../assignment-form";

function displayCourseName(courseName: string, courseCode: string | null) {
  if (!courseCode) return courseName;
  return courseName.toLowerCase().includes(courseCode.toLowerCase()) ? courseName : `${courseName} ${courseCode}`;
}

export default async function NewAssignmentPage() {
  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const supabase = await createClient();
  const [{ data: periods }, { data: categories }, { data: types }] = await Promise.all([
    supabase.from("grading_periods").select("id,code,name,sort_order").eq("section_id", section.sectionId).eq("calculation_mode", "direct").order("sort_order").order("code"),
    supabase.from("grading_categories").select("id,code,name,sort_order").eq("section_id", section.sectionId).order("sort_order").order("name"),
    supabase.from("assignment_types").select("id,code,name,description,default_category_id,default_points_possible,default_allow_retakes,sort_order").eq("section_id", section.sectionId).eq("active", true).order("sort_order").order("name"),
  ]);
  const today = new Date().toISOString().slice(0, 10);

  const assignmentTypes = (types ?? []).map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    description: type.description,
    defaultCategoryId: type.default_category_id,
    defaultPointsPossible: Number(type.default_points_possible),
    defaultAllowRetakes: Boolean(type.default_allow_retakes),
  }));

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Grade Analytics</p>
        <h1>Assignment Creation</h1>
        <p className="subtle">{displayCourseName(section.courseName, section.courseCode)} • {section.sectionName}</p>
        <TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/assignments/new"/>
      </div>
    </header>
    <TeacherPrimaryNav/>
    <section className="content-wrap assignment-create-wrap">
      <article className="panel">
        <div className="panel-header">
          <div><p className="eyebrow">New assignment</p><h2>What are you entering?</h2><p className="subtle">Choose an assignment type, then confirm the grading category and behavior. Type and category are independent so each course can use its own structure.</p></div>
          <Link className="secondary-link" href="/assignments"><ArrowLeft size={17}/> Back to Assignments</Link>
        </div>
        <AssignmentForm
          sectionId={section.sectionId}
          periods={(periods ?? []).map((period) => ({ id: period.id, code: period.code, name: period.name }))}
          categories={(categories ?? []).map((category) => ({ id: category.id, code: category.code, name: category.name }))}
          assignmentTypes={assignmentTypes}
          today={today}
        />
      </article>
    </section>
  </main>;
}
