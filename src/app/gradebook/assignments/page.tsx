import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getAssignmentMatrix } from "@/lib/data/assignment-matrix";
import { getSectionGradingPeriods } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { AssignmentMatrixGrid } from "./assignment-matrix-grid";
import styles from "./assignment-matrix.module.css";

type PageProps = { searchParams: Promise<{ period?: string; category?: string }> };

export default async function AssignmentMatrixPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;

  const [roster, periods, params, categoriesResult] = await Promise.all([
    getSectionRoster(section.sectionId, "active"),
    getSectionGradingPeriods(section.sectionId),
    searchParams,
    supabase.from("grading_categories").select("code,name,sort_order").eq("section_id", section.sectionId).order("sort_order").order("name"),
  ]);
  const selectablePeriods = periods.filter((period) => period.calculationMode === "direct");
  const selectedPeriod = selectablePeriods.find((period) => period.code === params.period) ?? selectablePeriods[0];
  const configuredCategories = categoriesResult.data ?? [];
  const categoryCodes = new Set(configuredCategories.map((category) => category.code));
  const selectedCategory = params.category && categoryCodes.has(params.category) ? params.category : "all";
  const categoryByCode = new Map(configuredCategories.map((category) => [category.code, category.name]));
  const matrix = selectedPeriod
    ? await getAssignmentMatrix(section.sectionId, roster.map((student) => student.studentId), selectedPeriod.code)
    : null;

  const visibleAssignments = matrix?.assignments.filter((assignment) => selectedCategory === "all" || assignment.category === selectedCategory) ?? [];
  const returnTo = `/gradebook/assignments?period=${encodeURIComponent(selectedPeriod?.code ?? "")}&category=${encodeURIComponent(selectedCategory)}`;

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Teacher Gradebook</p><h1>Assignment matrix</h1><p className="subtle">{section.courseName} • {section.sectionName} • students × assignments</p></div>
      <div className="grade-audit-header-actions">
        <Link className="secondary-link" href="/"><ArrowLeft size={17}/> Back to Dashboard</Link>
        <Link className="secondary-link" href={`/gradebook${selectedPeriod ? `?period=${selectedPeriod.code}` : ""}`}>Overview</Link>
        <Link className="secondary-link" href={`/gradebook/powerschool${selectedPeriod && selectedPeriod.periodRole !== "exam" ? `?period=${selectedPeriod.code}` : ""}`}>PowerSchool Comparison</Link>
      </div>
    </header>

    <section className={`content-wrap ${styles.content}`}>
      <article className={`panel ${styles.controls}`}>
        <div className="panel-header"><div><p className="eyebrow">Spreadsheet view</p><h3>Students by assignment</h3></div></div>
        <form method="get" className={styles.filterForm}>
          <label><span>Grading period</span><select name="period" defaultValue={selectedPeriod?.code}>{selectablePeriods.map((period) => <option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <label><span>Category</span><select name="category" defaultValue={selectedCategory}><option value="all">All categories</option>{configuredCategories.map((category) => <option value={category.code} key={category.code}>{category.name}</option>)}</select></label>
          <button className="primary-button" type="submit">View Assignments</button>
        </form>
      </article>

      <article className={`panel full-width ${styles.matrixPanel}`}>
        <div className="panel-header">
          <div><p className="eyebrow">{selectedPeriod?.code ?? "Gradebook"}</p><h3>{selectedCategory === "all" ? "All assignments" : `${categoryByCode.get(selectedCategory) ?? selectedCategory} assignments`}</h3></div>
          <span className="subtle">Edit Attempt 1 directly. Open an assignment for retakes, bulk actions, or deeper editing.</span>
        </div>

        {!matrix || visibleAssignments.length === 0 ? <div className={styles.emptyState}>No assignments are configured for this grading period and category yet.</div> :
          <AssignmentMatrixGrid
            assignments={visibleAssignments}
            students={matrix.students}
            roster={roster.map((student) => ({ studentId: student.studentId, displayName: student.displayName, email: student.email }))}
            rules={matrix.rules}
            periodCode={matrix.gradingPeriod.code}
            returnTo={returnTo}
          />}
      </article>
    </section>
  </main>;
}