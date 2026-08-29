import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentTypeManager } from "./assignment-type-manager";
import styles from "./settings.module.css";

export default async function SettingsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const courseName = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  const [{ data: categories, error: categoryError }, { data: assignmentTypes, error: typeError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase
      .from("grading_categories")
      .select("id,name,sort_order")
      .eq("section_id", section.sectionId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("assignment_types")
      .select("id,code,name,description,default_category_id,default_points_possible,default_allow_retakes,active,sort_order")
      .eq("section_id", section.sectionId)
      .order("sort_order")
      .order("name"),
    supabase
      .from("assignments")
      .select("assignment_type_id")
      .eq("section_id", section.sectionId),
  ]);
  if (categoryError) throw categoryError;
  if (typeError) throw typeError;
  if (assignmentError) throw assignmentError;

  const assignmentCounts = new Map<string, number>();
  (assignments ?? []).forEach((assignment) => {
    if (!assignment.assignment_type_id) return;
    assignmentCounts.set(assignment.assignment_type_id, (assignmentCounts.get(assignment.assignment_type_id) ?? 0) + 1);
  });

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>Settings</h1><p className="subtle">{courseName} • {section.sectionName}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo="/settings"/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <article className={`panel ${styles.settingsIntro}`}>
        <p className="eyebrow">Course settings</p>
        <h2>Assignment Type Hotlist</h2>
        <p className="subtle">Control the quick-select assignment types that appear on New Assignment for this course. Changing a type here changes future defaults only; existing assignments, scores, attempts, and history stay intact.</p>
      </article>

      <div className={styles.settingsGrid}>
        <AssignmentTypeManager
          sectionId={section.sectionId}
          categories={(categories ?? []).map((category) => ({ id: category.id, name: category.name }))}
          assignmentTypes={(assignmentTypes ?? []).map((type) => ({
            id: type.id,
            code: type.code,
            name: type.name,
            description: type.description,
            defaultCategoryId: type.default_category_id,
            defaultPointsPossible: Number(type.default_points_possible),
            defaultAllowRetakes: Boolean(type.default_allow_retakes),
            active: Boolean(type.active),
            sortOrder: type.sort_order,
            assignmentCount: assignmentCounts.get(type.id) ?? 0,
          }))}
        />

        <aside className={styles.sidebarStack}>
          <article className="panel">
            <p className="eyebrow">How it works</p>
            <div className={styles.sidebarStack}>
              <div className={styles.sidebarItem}><strong>Display name</strong><span>The label teachers see on the New Assignment card.</span></div>
              <div className={styles.sidebarItem}><strong>Defaults</strong><span>Starting category, points, and retake behavior. They remain editable per assignment.</span></div>
              <div className={styles.sidebarItem}><strong>Deactivate</strong><span>Removes a type from the hotlist without breaking assignments that already use it.</span></div>
              <div className={styles.sidebarItem}><strong>Order</strong><span>Controls the left-to-right / top-to-bottom order of New Assignment quick-select cards.</span></div>
            </div>
          </article>

          <article className="panel">
            <p className="eyebrow">Coming next</p>
            <h3>More course configuration</h3>
            <p className="subtle">Grading categories, grading periods, grading policies, and course details can build on this same Settings workspace after the hotlist has had real classroom use.</p>
          </article>
        </aside>
      </div>
    </section>
  </main>;
}
