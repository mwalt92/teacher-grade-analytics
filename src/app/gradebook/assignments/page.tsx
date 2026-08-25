import Link from "next/link";
import { redirect } from "next/navigation";
import { getAssignmentMatrix } from "@/lib/data/assignment-matrix";
import { getSectionGradingPeriods } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { getTeacherSections } from "@/lib/data/teacher-context";
import type { GradingCategory } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";
import styles from "./assignment-matrix.module.css";

type PageProps = { searchParams: Promise<{ period?: string; category?: string }> };
type CategoryFilter = "all" | GradingCategory;

const categoryLabels: Record<GradingCategory, string> = {
  participation: "Participation",
  quiz: "Quiz",
  test: "Test",
};

function categoryFilter(value: string | undefined): CategoryFilter {
  return value === "participation" || value === "quiz" || value === "test" ? value : "all";
}

function shortDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("en-US", { month: "numeric", day: "numeric" });
}

export default async function AssignmentMatrixPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;

  const [roster, periods, params] = await Promise.all([
    getSectionRoster(section.sectionId, "active"),
    getSectionGradingPeriods(section.sectionId),
    searchParams,
  ]);
  const selectablePeriods = periods.filter((period) => /^(Q[1-4]|S[12])$/.test(period.code));
  const selectedPeriod = selectablePeriods.find((period) => period.code === params.period) ?? selectablePeriods[0];
  const selectedCategory = categoryFilter(params.category);
  const matrix = selectedPeriod
    ? await getAssignmentMatrix(section.sectionId, roster.map((student) => student.studentId), selectedPeriod.code)
    : null;

  const studentById = new Map(roster.map((student) => [student.studentId, student]));
  const visibleAssignments = matrix?.assignments.filter((assignment) => selectedCategory === "all" || assignment.category === selectedCategory) ?? [];
  const visibleAssignmentIds = new Set(visibleAssignments.map((assignment) => assignment.id));
  const visibleTotals = { entered: 0, missing: 0, dropped: 0, exempt: 0, unentered: 0 };
  for (const student of matrix?.students ?? []) {
    for (const cell of Object.values(student.cells)) {
      if (!visibleAssignmentIds.has(cell.assignmentId)) continue;
      if (cell.missing) visibleTotals.missing += 1;
      if (cell.status === "dropped") visibleTotals.dropped += 1;
      if (cell.status === "exempt") visibleTotals.exempt += 1;
      else if (cell.status === "unentered") visibleTotals.unentered += 1;
      else if (!cell.missing) visibleTotals.entered += 1;
    }
  }

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Teacher Gradebook</p><h1>Assignment matrix</h1><p className="subtle">{section.courseName} • {section.sectionName} • students × assignments</p></div>
      <div className="grade-audit-header-actions">
        <Link className="secondary-link" href={`/gradebook${selectedPeriod ? `?period=${selectedPeriod.code}` : ""}`}>Overview</Link>
        <Link className="secondary-link" href={`/gradebook/powerschool${selectedPeriod ? `?period=${selectedPeriod.code}` : ""}`}>PowerSchool Comparison</Link>
        <Link className="secondary-link" href="/">Dashboard</Link>
      </div>
    </header>

    <section className={`content-wrap ${styles.content}`}>
      <article className={`panel ${styles.controls}`}>
        <div className="panel-header"><div><p className="eyebrow">Spreadsheet view</p><h3>Students by assignment</h3></div></div>
        <form method="get" className={styles.filterForm}>
          <label><span>Grading period</span><select name="period" defaultValue={selectedPeriod?.code}>{selectablePeriods.map((period) => <option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <label><span>Category</span><select name="category" defaultValue={selectedCategory}><option value="all">All categories</option><option value="participation">Participation</option><option value="quiz">Quizzes</option><option value="test">Tests</option></select></label>
          <button className="primary-button" type="submit">View Assignments</button>
        </form>
      </article>

      <section className={`metric-grid ${styles.metrics}`} aria-label="Assignment matrix summary">
        <article className="metric-card"><span className="metric-label">Assignments shown</span><strong>{visibleAssignments.length}</strong></article>
        <article className="metric-card"><span className="metric-label">Entered scores</span><strong>{visibleTotals.entered}</strong></article>
        <article className="metric-card"><span className="metric-label">Missing</span><strong>{visibleTotals.missing}</strong></article>
        <article className="metric-card"><span className="metric-label">Unentered</span><strong>{visibleTotals.unentered}</strong></article>
        <article className="metric-card"><span className="metric-label">Dropped</span><strong>{visibleTotals.dropped}</strong></article>
      </section>

      <article className={`panel full-width ${styles.matrixPanel}`}>
        <div className="panel-header">
          <div><p className="eyebrow">{selectedPeriod?.code ?? "Gradebook"}</p><h3>{selectedCategory === "all" ? "All assignments" : `${categoryLabels[selectedCategory]} assignments`}</h3></div>
          <span className="subtle">Click an assignment or score to open its grade-entry screen.</span>
        </div>
        <div className={styles.legend} aria-label="Gradebook status legend">
          <span><i className={styles.legendMissing}/> Missing</span>
          <span><i className={styles.legendDropped}/> Dropped</span>
          <span><i className={styles.legendBest}/> Multiple attempts / best counts</span>
          <span><i className={styles.legendExempt}/> Exempt</span>
        </div>

        {visibleAssignments.length === 0 ? <div className={styles.emptyState}>No assignments are configured for this grading period and category yet.</div> :
          <div className={styles.matrixScroll}>
            <table className={styles.matrix}>
              <thead><tr>
                <th className={styles.studentHeader}>Student</th>
                {visibleAssignments.map((assignment) => <th key={assignment.id}>
                  <Link className={styles.assignmentHeader} href={`/assignments/${assignment.id}`}>
                    <strong>{assignment.title}</strong>
                    <span>{categoryLabels[assignment.category]} • {shortDate(assignment.assignmentDate)}</span>
                    <span>{assignment.pointsPossible} pts{assignment.allowRetakes ? " • retakes" : ""}</span>
                  </Link>
                </th>)}
              </tr></thead>
              <tbody>
                {(matrix?.students ?? []).map((studentRow) => {
                  const student = studentById.get(studentRow.studentId);
                  if (!student) return null;
                  return <tr key={studentRow.studentId}>
                    <th scope="row" className={styles.studentCell}><strong>{student.displayName}</strong>{student.email ? <small>{student.email}</small> : null}</th>
                    {visibleAssignments.map((assignment) => {
                      const cell = studentRow.cells[assignment.id];
                      if (!cell) return <td key={assignment.id} className={styles.unenteredCell}><Link href={`/assignments/${assignment.id}`}>—</Link></td>;
                      const classNames = [styles.scoreCell];
                      if (cell.missing) classNames.push(styles.missingCell);
                      if (cell.status === "dropped") classNames.push(styles.droppedCell);
                      if (cell.status === "exempt") classNames.push(styles.exemptCell);
                      if (cell.status === "unentered") classNames.push(styles.unenteredCell);
                      if (cell.attemptCount > 1) classNames.push(styles.bestCell);
                      return <td key={assignment.id} className={classNames.join(" ")}>
                        <Link href={`/assignments/${assignment.id}`} className={styles.scoreLink}>
                          {cell.missing ? <><strong>Missing</strong><small>0 / {cell.possible}</small></> :
                           cell.status === "exempt" ? <><strong>Exempt</strong><small>Not counted</small></> :
                           cell.status === "unentered" ? <><strong>—</strong><small>Unentered</small></> :
                           <><strong>{cell.earned ?? 0} / {cell.possible}</strong><small>{cell.percent?.toFixed(1)}%</small></>}
                          <span className={styles.cellBadges}>
                            {cell.status === "dropped" ? <em className={styles.droppedBadge}>Dropped</em> : null}
                            {cell.attemptCount > 1 ? <em className={styles.bestBadge}>Best #{cell.countedAttemptNumber ?? "?"} of {cell.attemptCount}</em> : null}
                          </span>
                        </Link>
                      </td>;
                    })}
                  </tr>;
                })}
              </tbody>
            </table>
          </div>}
      </article>
    </section>
  </main>;
}
