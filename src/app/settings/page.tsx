import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentTypeManager } from "./assignment-type-manager";
import { GradingCategoryManager } from "./grading-category-manager";
import styles from "./settings.module.css";

type SettingsArea = "assignment-types" | "grading-categories";

type SettingsPageProps = {
  searchParams: Promise<{ area?: string | string[] }>;
};

export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") redirect("/login");

  const params = await searchParams;
  const requestedArea = Array.isArray(params.area) ? params.area[0] : params.area;
  const area: SettingsArea = requestedArea === "grading-categories" ? "grading-categories" : "assignment-types";

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) redirect("/");
  const courseName = section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName;

  const [{ data: categories, error: categoryError }, { data: assignmentTypes, error: typeError }, { data: assignments, error: assignmentError }] = await Promise.all([
    supabase
      .from("grading_categories")
      .select("id,code,name,weight,drop_lowest,late_deduction,calculation_method,sort_order")
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
      .select("assignment_type_id,category_id")
      .eq("section_id", section.sectionId),
  ]);
  if (categoryError) throw categoryError;
  if (typeError) throw typeError;
  if (assignmentError) throw assignmentError;

  const assignmentTypeCounts = new Map<string, number>();
  const categoryAssignmentCounts = new Map<string, number>();
  (assignments ?? []).forEach((assignment) => {
    if (assignment.assignment_type_id) {
      assignmentTypeCounts.set(assignment.assignment_type_id, (assignmentTypeCounts.get(assignment.assignment_type_id) ?? 0) + 1);
    }
    if (assignment.category_id) {
      categoryAssignmentCounts.set(assignment.category_id, (categoryAssignmentCounts.get(assignment.category_id) ?? 0) + 1);
    }
  });

  const categoryDefaultTypeCounts = new Map<string, number>();
  (assignmentTypes ?? []).forEach((type) => {
    categoryDefaultTypeCounts.set(type.default_category_id, (categoryDefaultTypeCounts.get(type.default_category_id) ?? 0) + 1);
  });

  const returnTo = area === "grading-categories" ? "/settings?area=grading-categories" : "/settings";

  return <main className="app-shell">
    <header className="topbar"><div><p className="eyebrow">Teacher Grade Analytics</p><h1>Settings</h1><p className="subtle">{courseName} • {section.sectionName}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo={returnTo}/></div></header>
    <TeacherPrimaryNav/>
    <section className="content-wrap">
      <nav className={styles.settingsNav} aria-label="Course settings sections">
        <Link className={area === "assignment-types" ? styles.settingsNavActive : ""} href="/settings">Assignment Types</Link>
        <Link className={area === "grading-categories" ? styles.settingsNavActive : ""} href="/settings?area=grading-categories">Grading Categories</Link>
      </nav>

      {area === "assignment-types" ? <>
        <article className={`panel ${styles.settingsIntro}`}>
          <p className="eyebrow">Course settings</p>
          <h2>Assignment Type Hotlist</h2>
          <p className="subtle">Control the quick-select assignment types that appear on New Assignment for this course. Changes here set defaults for future assignments; existing assignment history stays intact.</p>
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
              assignmentCount: assignmentTypeCounts.get(type.id) ?? 0,
            }))}
          />

          <aside className={styles.sidebarStack}>
            <article className="panel">
              <p className="eyebrow">Quick guide</p>
              <div className={styles.sidebarStack}>
                <div className={styles.sidebarItem}><strong>Defaults</strong><span>Category, points, and retake settings start here but remain editable on each assignment.</span></div>
                <div className={styles.sidebarItem}><strong>Deactivate</strong><span>Removes a type from New Assignment while keeping existing assignments attached to it.</span></div>
                <div className={styles.sidebarItem}><strong>Order</strong><span>Controls the order of New Assignment quick-select cards.</span></div>
              </div>
            </article>
          </aside>
        </div>
      </> : <>
        <article className={`panel ${styles.settingsIntro}`}>
          <p className="eyebrow">Course settings</p>
          <h2>Grading Categories</h2>
          <p className="subtle">Manage the category rules used by the grading engine. Save only when the full weight total is 100%; saved changes recalculate live grades immediately.</p>
        </article>

        <div className={styles.settingsGrid}>
          <GradingCategoryManager
            sectionId={section.sectionId}
            categories={(categories ?? []).map((category) => ({
              id: category.id,
              code: category.code,
              name: category.name,
              weightPercent: Number(category.weight) * 100,
              dropLowest: category.drop_lowest,
              lateDeductionPercent: Number(category.late_deduction) * 100,
              calculationMethod: category.calculation_method === "total_points" ? "total_points" as const : "equal_assignment_percentage" as const,
              assignmentCount: categoryAssignmentCounts.get(category.id) ?? 0,
              defaultTypeCount: categoryDefaultTypeCounts.get(category.id) ?? 0,
            }))}
          />

          <aside className={styles.sidebarStack}>
            <article className="panel">
              <p className="eyebrow">What changes grades</p>
              <div className={styles.sidebarStack}>
                <div className={styles.sidebarItem}><strong>Weight</strong><span>How much the category contributes when it has counted work.</span></div>
                <div className={styles.sidebarItem}><strong>Calculation</strong><span>Choose total points or equal assignment percentages within the category.</span></div>
                <div className={styles.sidebarItem}><strong>Drop lowest</strong><span>Drops that many lowest counted assignments using the canonical grading rules.</span></div>
                <div className={styles.sidebarItem}><strong>Late deduction</strong><span>Sets the category-level late-work deduction used by projections and policy-aware workflows.</span></div>
              </div>
            </article>
          </aside>
        </div>
      </>}
    </section>
  </main>;
}
