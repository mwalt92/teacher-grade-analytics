import Link from "next/link";
import { redirect } from "next/navigation";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionGradebook, getSectionGradingPeriods, type SectionGradebookCalculation } from "@/lib/data/grade-calculation";
import { getLatestPowerSchoolSnapshots, POWERSCHOOL_TOLERANCE, type PowerSchoolSnapshot } from "@/lib/data/powerschool";
import { getSectionRoster } from "@/lib/data/roster";
import { getActiveTeacherSection, getTeacherSections } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { importPowerSchoolFinalGrades, savePowerSchoolSnapshot } from "./actions";
import styles from "./powerschool.module.css";

function formatPercent(value: number | null, digits = 2) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function formatDifference(value: number | null) {
  if (value === null) return "—";
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} pts`;
}

function diagnosticStats(calculation: SectionGradebookCalculation | null, snapshots: PowerSchoolSnapshot[]) {
  const rowByStudent = new Map(calculation?.rows.map((row) => [row.studentId, row]) ?? []);
  const differences = snapshots.flatMap((snapshot) => {
    const website = rowByStudent.get(snapshot.studentId)?.overallPercent ?? null;
    return website === null ? [] : [website - snapshot.powerSchoolPercent];
  });
  if (!differences.length) return { count: 0, meanAbsoluteError: null as number | null, mismatchCount: 0 };
  return {
    count: differences.length,
    meanAbsoluteError: differences.reduce((sum, difference) => sum + Math.abs(difference), 0) / differences.length,
    mismatchCount: differences.filter((difference) => Math.abs(difference) >= POWERSCHOOL_TOLERANCE).length,
  };
}

type PageProps = { searchParams: Promise<{ period?: string; saved?: string; imported?: string; unmatched?: string; skipped?: string; terms?: string }> };

export default async function PowerSchoolComparisonPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const [sections, section] = await Promise.all([getTeacherSections(), getActiveTeacherSection()]);
  if (!section) return <main className="content-wrap"><article className="panel"><h1>No teacher section is available.</h1></article></main>;

  const [roster, periods, params] = await Promise.all([
    getSectionRoster(section.sectionId, "active"),
    getSectionGradingPeriods(section.sectionId),
    searchParams,
  ]);
  const selectablePeriods = periods.filter((period) => period.periodRole !== "exam");
  const selectedPeriod = selectablePeriods.find((period) => period.code === params.period) ?? selectablePeriods[0];
  const studentIds = roster.map((student) => student.studentId);

  const [calculation, equalCalculation, totalPointsCalculation, snapshots] = selectedPeriod
    ? await Promise.all([
        getSectionGradebook(section.sectionId, studentIds, selectedPeriod.code),
        getSectionGradebook(section.sectionId, studentIds, selectedPeriod.code, { calculationMethodOverride: "equal_assignment_percentage" }),
        getSectionGradebook(section.sectionId, studentIds, selectedPeriod.code, { calculationMethodOverride: "total_points" }),
        getLatestPowerSchoolSnapshots(section.sectionId, selectedPeriod.id, studentIds),
      ])
    : [null, null, null, [] as PowerSchoolSnapshot[]];

  const rowByStudent = new Map(calculation?.rows.map((row) => [row.studentId, row]) ?? []);
  const snapshotByStudent = new Map(snapshots.map((snapshot) => [snapshot.studentId, snapshot]));
  const comparisons = roster.flatMap((student) => {
    const website = rowByStudent.get(student.studentId)?.overallPercent ?? null;
    const snapshot = snapshotByStudent.get(student.studentId);
    if (website === null || !snapshot) return [];
    return [{ difference: website - snapshot.powerSchoolPercent }];
  });
  const mismatchCount = comparisons.filter(({ difference }) => Math.abs(difference) >= POWERSCHOOL_TOLERANCE).length;
  const configuredStats = diagnosticStats(calculation, snapshots);
  const equalStats = diagnosticStats(equalCalculation, snapshots);
  const totalPointsStats = diagnosticStats(totalPointsCalculation, snapshots);

  const savedCount = Number(params.saved ?? 0);
  const importedCount = Number(params.imported ?? 0);
  const unmatchedCount = Number(params.unmatched ?? 0);
  const skippedCount = Number(params.skipped ?? 0);
  const importedTerms = String(params.terms ?? "").split(",").filter(Boolean);
  const returnTo = selectedPeriod ? `/gradebook/powerschool?period=${encodeURIComponent(selectedPeriod.code)}` : "/gradebook/powerschool";

  return <main className="app-shell">
    <header className="topbar">
      <div><p className="eyebrow">Teacher Gradebook</p><h1>PowerSchool comparison</h1><p className="subtle">{section.courseCode ? `${section.courseName} ${section.courseCode}` : section.courseName} • {section.sectionName}</p><TeacherSectionSwitcher sections={sections} activeSectionId={section.sectionId} returnTo={returnTo}/></div>
    </header>
    <TeacherPrimaryNav/>
    <section className={`content-wrap ${styles.content}`}>
      <div className={styles.controlGrid}>
        <article className={`panel ${styles.controls}`}>
          <div className="panel-header"><div><p className="eyebrow">Comparison controls</p><h3>Compare a grading period</h3></div><Link className="secondary-link" href={`/gradebook${selectedPeriod ? `?period=${selectedPeriod.code}` : ""}`}>Gradebook Overview</Link></div>
          <form method="get" className={styles.periodForm}><label><span>Grading period</span><select name="period" defaultValue={selectedPeriod?.code}>{selectablePeriods.map((period) => <option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label><button className="primary-button" type="submit">View Comparison</button></form>
        </article>

        <article className={`panel ${styles.importPanel}`}>
          <div className="panel-header"><div><p className="eyebrow">Fast import</p><h3>PowerSchool Final Grades report</h3></div></div>
          <p className="subtle">Upload the .xlsx report directly from PowerSchool. Reporting terms and student names are matched automatically; decimal grades such as 0.94 are converted to 94%.</p>
          <form action={importPowerSchoolFinalGrades} className={styles.importForm}>
            <input type="hidden" name="sectionId" value={section.sectionId}/>
            <label className={styles.fileField}><span>Final Grades report (.xlsx)</span><input type="file" name="report" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" required/></label>
            <button className="primary-button" type="submit">Import & Compare</button>
          </form>
        </article>
      </div>

      {savedCount > 0 ? <div className={styles.savedBanner}>Saved a new comparison snapshot for {savedCount} student{savedCount === 1 ? "" : "s"}.</div> : null}
      {importedCount > 0 ? <div className={styles.importBanner}><strong>Imported {importedCount} comparison snapshot{importedCount === 1 ? "" : "s"}{importedTerms.length ? ` across ${importedTerms.join(", ")}` : ""}.</strong>{unmatchedCount > 0 || skippedCount > 0 ? <span>{unmatchedCount > 0 ? `${unmatchedCount} report row${unmatchedCount === 1 ? "" : "s"} could not be matched to the active roster. ` : ""}{skippedCount > 0 ? `${skippedCount} row${skippedCount === 1 ? " was" : "s were"} skipped because the term was unsupported, the row was incomplete, or no website grade existed yet.` : ""}</span> : <span>All usable rows matched successfully.</span>}</div> : null}

      <section className={`metric-grid ${styles.metrics}`} aria-label="PowerSchool comparison summary">
        <article className="metric-card"><span className="metric-label">Compared students</span><strong>{comparisons.length}</strong></article>
        <article className="metric-card"><span className="metric-label">Within ±{POWERSCHOOL_TOLERANCE.toFixed(1)}</span><strong>{comparisons.length - mismatchCount}</strong></article>
        <article className="metric-card"><span className="metric-label">Needs review</span><strong>{mismatchCount}</strong></article>
        <article className="metric-card"><span className="metric-label">Not yet captured</span><strong>{roster.length - snapshots.length}</strong></article>
      </section>

      <article className={`panel full-width ${styles.diagnosticPanel}`}>
        <div className="panel-header"><div><p className="eyebrow">Calculation-method diagnostic</p><h3>Which category arithmetic is closest to PowerSchool?</h3><p className="subtle">The same current grades are recalculated three ways. This does not change any official website grade or category setting.</p></div></div>
        <div className={styles.diagnosticGrid}>
          <div className={styles.diagnosticCard}><span>Configured method</span><strong>{configuredStats.meanAbsoluteError === null ? "—" : `${configuredStats.meanAbsoluteError.toFixed(2)} pts MAE`}</strong><small>{configuredStats.count} compared • {configuredStats.mismatchCount} outside tolerance</small></div>
          <div className={styles.diagnosticCard}><span>Force equal assignment %</span><strong>{equalStats.meanAbsoluteError === null ? "—" : `${equalStats.meanAbsoluteError.toFixed(2)} pts MAE`}</strong><small>{equalStats.count} compared • {equalStats.mismatchCount} outside tolerance</small></div>
          <div className={styles.diagnosticCard}><span>Force total points</span><strong>{totalPointsStats.meanAbsoluteError === null ? "—" : `${totalPointsStats.meanAbsoluteError.toFixed(2)} pts MAE`}</strong><small>{totalPointsStats.count} compared • {totalPointsStats.mismatchCount} outside tolerance</small></div>
        </div>
        <p className={styles.diagnosticNote}><strong>Important:</strong> use these numbers only when the PowerSchool snapshot and website contain the same assignments and scores. Older snapshots can look worse simply because the development gradebook changed after capture. Once differently sized assignments exist in both systems, this panel can distinguish equal weighting from total-points behavior directly.</p>
      </article>

      <form action={savePowerSchoolSnapshot}>
        <input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="period" value={selectedPeriod?.code ?? ""}/>
        <article className={`panel full-width ${styles.tablePanel}`}>
          <div className="panel-header"><div><p className="eyebrow">{selectedPeriod?.code ?? "PowerSchool"}</p><h3>Website vs. PowerSchool</h3></div><div className={styles.captureActions}><span className="subtle">Manual entry remains available as a fallback. Every save creates a timestamped historical snapshot.</span><button className="primary-button" type="submit">Save Comparison</button></div></div>
          <div className={styles.tableScroll}><div className={styles.table} role="table" aria-label="PowerSchool grade comparison">
            <div className={`${styles.row} ${styles.head}`} role="row"><span>Student</span><span>Website</span><span>PowerSchool</span><span>Difference</span><span>Status</span><span>Audit</span></div>
            {roster.map((student) => {
              const row = rowByStudent.get(student.studentId);
              const website = row?.overallPercent ?? null;
              const snapshot = snapshotByStudent.get(student.studentId);
              const powerSchool = snapshot?.powerSchoolPercent ?? null;
              const difference = website !== null && powerSchool !== null ? website - powerSchool : null;
              const mismatch = difference !== null && Math.abs(difference) >= POWERSCHOOL_TOLERANCE;
              return <div className={styles.row} role="row" key={student.studentId}>
                <span className={styles.student}><strong>{student.displayName}</strong>{student.email ? <small>{student.email}</small> : null}</span>
                <strong>{formatPercent(website)}</strong>
                <span>{website === null ? <span className="subtle">No website grade</span> : <input className={styles.gradeInput} name={`powerschool:${student.studentId}`} type="number" min="0" max="200" step="0.01" defaultValue={powerSchool ?? ""} placeholder="Enter %" aria-label={`PowerSchool grade for ${student.displayName}`}/>}</span>
                <strong className={mismatch ? styles.mismatchText : styles.matchText}>{formatDifference(difference)}</strong>
                <span>{difference === null ? <span className="status neutral-pill">Not compared</span> : mismatch ? <span className="status warning-pill">Review</span> : <span className="status success-pill">Within tolerance</span>}</span>
                <Link className="text-button" href={`/gradebook/audit?studentId=${student.studentId}&period=${selectedPeriod?.code ?? ""}`}>Audit →</Link>
              </div>;
            })}
          </div></div>
        </article>
      </form>
    </section>
  </main>;
}
