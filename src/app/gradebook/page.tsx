import Link from "next/link";
import { redirect } from "next/navigation";
import { getSectionRoster } from "@/lib/data/roster";
import { getSectionGradingPeriods, getStudentGradeCalculation } from "@/lib/data/grade-calculation";
import { getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function formatPercent(value: number | null) {
  return value === null ? "—" : `${value.toFixed(2)}%`;
}

function categoryLabel(category: string) {
  if (category === "participation") return "Participation";
  if (category === "quiz") return "Quizzes";
  if (category === "test") return "Tests";
  return category;
}

type GradebookPageProps = {
  searchParams: Promise<{ studentId?: string; period?: string }>;
};

export default async function GradebookPage({ searchParams }: GradebookPageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const sections = await getTeacherSections();
  const section = sections[0];
  if (!section) {
    return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;
  }

  const [roster, periods, params] = await Promise.all([
    getSectionRoster(section.sectionId, "all"),
    getSectionGradingPeriods(section.sectionId),
    searchParams,
  ]);

  const quarterPeriods = periods.filter((period) => period.code.startsWith("Q"));
  const selectedStudent = roster.find((student) => student.studentId === params.studentId) ?? roster[0];
  const selectedPeriod = quarterPeriods.find((period) => period.code === params.period) ?? quarterPeriods[0];

  const calculation = selectedStudent && selectedPeriod
    ? await getStudentGradeCalculation(section.sectionId, selectedStudent.studentId, selectedPeriod.code)
    : null;

  return <main className="app-shell">
    <header className="topbar">
      <div>
        <p className="eyebrow">Teacher Gradebook</p>
        <h1>Grade calculation audit</h1>
        <p className="subtle">{section.courseName} • {section.sectionName} • deterministic engine output</p>
      </div>
      <div className="toolbar-group"><Link className="secondary-button" href="/">Back to dashboard</Link></div>
    </header>

    <section className="content-wrap">
      <article className="panel full-width">
        <div className="panel-header"><div><p className="eyebrow">Audit controls</p><h3>Choose a student and quarter</h3></div></div>
        <form method="get" className="toolbar-group">
          <select name="studentId" defaultValue={selectedStudent?.studentId} aria-label="Select student">
            {roster.map((student) => <option key={student.studentId} value={student.studentId}>{student.displayName}{student.active ? "" : " (Inactive)"}</option>)}
          </select>
          <select name="period" defaultValue={selectedPeriod?.code} aria-label="Select grading period">
            {quarterPeriods.map((period) => <option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}
          </select>
          <button className="primary-button" type="submit">Load audit</button>
        </form>
      </article>

      {!calculation || !selectedStudent ? <article className="panel full-width"><p className="subtle">No calculation data is available for this selection.</p></article> : <>
        <section className="metric-grid" aria-label="Student grade summary">
          <article className="metric-card"><span className="metric-label">Student</span><strong>{selectedStudent.displayName}</strong></article>
          <article className="metric-card"><span className="metric-label">Current {calculation.gradingPeriod.code}</span><strong>{formatPercent(calculation.result.overallPercent)}</strong></article>
          {(["participation", "quiz", "test"] as const).map((category) => <article className="metric-card" key={category}>
            <span className="metric-label">{categoryLabel(category)}</span>
            <strong>{formatPercent(calculation.result.categoryPercents[category] ?? null)}</strong>
            <span className="subtle">Weight {(calculation.rules.categoryWeights[category] * 100).toFixed(0)}%</span>
          </article>)}
        </section>

        <article className="panel full-width">
          <div className="panel-header"><div><p className="eyebrow">Final arithmetic</p><h3>Active category weighting</h3></div></div>
          <div className="integrity-stack">
            {(["participation", "quiz", "test"] as const).map((category) => {
              const categoryResult = calculation.result.categories[category];
              if (!categoryResult) return <div className="integrity-item" key={category}><span>{categoryLabel(category)} — no current data</span><strong>Excluded</strong></div>;
              return <div className="integrity-item" key={category}>
                <span>{categoryLabel(category)}: {categoryResult.averagePercent.toFixed(2)}% × {(categoryResult.configuredWeight * 100).toFixed(0)}%</span>
                <strong>{categoryResult.weightedContribution.toFixed(2)}</strong>
              </div>;
            })}
            <div className="integrity-item success"><span>Weighted total ÷ active weight ({(calculation.result.activeWeight * 100).toFixed(0)}%)</span><strong>{formatPercent(calculation.result.overallPercent)}</strong></div>
          </div>
        </article>

        <article className="panel full-width">
          <div className="panel-header"><div><p className="eyebrow">Assignment audit</p><h3>Exactly what counts</h3></div></div>
          <div className="assignment-table" role="table" aria-label="Grade calculation audit">
            <div className="assignment-row table-head" role="row"><span>Assignment</span><span>Category</span><span>Counted score</span><span>Decision</span><span>Attempts</span></div>
            {calculation.result.audit.map((line) => <div className="assignment-row" role="row" key={line.assignmentId}>
              <span><strong>{line.assignmentTitle ?? line.assignmentId}</strong><br/><small>{line.assignmentDate ?? ""}</small></span>
              <span>{categoryLabel(line.category)}</span>
              <span>{formatPercent(line.percent)}</span>
              <span className={line.status === "counted" ? "status success-pill" : line.status === "missing" || line.status === "dropped" ? "status warning-pill" : "status"}>{line.status}{line.countedAttemptNumber ? ` · Attempt ${line.countedAttemptNumber}` : ""}</span>
              <span>{line.attempts.length === 0 ? "—" : line.attempts.map((attempt) => `${attempt.attemptNumber}: ${attempt.earned}/${attempt.possible} (${attempt.percent.toFixed(2)}%)${attempt.counted ? " ✓" : ""}`).join(" · ")}</span>
            </div>)}
          </div>
        </article>
      </>}
    </section>
  </main>;
}
