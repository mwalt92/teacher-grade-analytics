import Link from "next/link";
import { setActiveTeacherSection } from "@/app/teacher-section-actions";
import { SectionScopeNav } from "@/components/section-scope-nav";
import { TeacherPrimaryNav } from "@/components/teacher-primary-nav";
import { TeacherSectionSwitcher } from "@/components/teacher-section-switcher";
import { getSectionGradebook, type GradingPeriodSummary } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import type { TeacherSectionSummary } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import styles from "./gradebook.module.css";

function formatPercent(value: number | null, digits = 2) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function sectionLabel(section: TeacherSectionSummary) {
  return section.periodNumber == null ? section.sectionName : `${section.sectionName} • Period ${section.periodNumber}`;
}

export async function AllSectionsGradebook({
  sections,
  offeringSections,
  activeSection,
  periods,
  selectedPeriod,
}: {
  sections: TeacherSectionSummary[];
  offeringSections: TeacherSectionSummary[];
  activeSection: TeacherSectionSummary;
  periods: GradingPeriodSummary[];
  selectedPeriod: GradingPeriodSummary;
}) {
  const supabase = await createClient();
  const sectionData = await Promise.all(offeringSections.map(async (section) => {
    const roster = await getSectionRoster(section.sectionId, "active");
    const calculation = await getSectionGradebook(section.sectionId, roster.map((student) => student.studentId), selectedPeriod.code);
    const rowByStudentId = new Map(calculation?.rows.map((row) => [row.studentId, row]) ?? []);
    return { section, roster, calculation, rowByStudentId };
  }));

  const firstCalculation = sectionData.map((entry) => entry.calculation).find(Boolean) ?? null;
  const categoryCodes = firstCalculation?.mode === "direct" ? Object.keys(firstCalculation.rules.categoryWeights) : [];
  let componentPeriods: GradingPeriodSummary[] = [];
  if (selectedPeriod.calculationMode === "composite") {
    const { data: componentRows } = await supabase
      .from("grading_period_components")
      .select("component_period_id,sort_order")
      .eq("parent_period_id", selectedPeriod.id)
      .order("sort_order", { ascending: true });
    const periodById = new Map(periods.map((period) => [period.id, period]));
    componentPeriods = (componentRows ?? [])
      .map((row) => periodById.get(row.component_period_id))
      .filter((period): period is GradingPeriodSummary => Boolean(period));
  }

  const detailColumns = firstCalculation?.mode === "composite"
    ? componentPeriods.map((period) => ({ key: period.code, label: period.periodRole === "exam" ? "Exam" : period.name }))
    : categoryCodes.map((code) => ({ key: code, label: firstCalculation?.rules.categoryLabels?.[code] ?? code }));

  const pooledRows = sectionData.flatMap(({ section, roster, rowByStudentId, calculation }) => roster.map((student) => ({
    section,
    student,
    row: rowByStudentId.get(student.studentId),
    calculation,
  })));
  const gradedRows = pooledRows.filter((entry) => entry.row?.overallPercent != null);
  const courseAverage = gradedRows.length
    ? gradedRows.reduce((sum, entry) => sum + (entry.row?.overallPercent ?? 0), 0) / gradedRows.length
    : null;
  const missingCount = pooledRows.reduce((sum, entry) => sum + (entry.row?.missingCount ?? 0), 0);
  const unenteredCount = pooledRows.reduce((sum, entry) => sum + (entry.row?.unenteredCount ?? 0), 0);
  const rowTemplate = `minmax(230px,1.8fr) minmax(105px,.8fr) repeat(${detailColumns.length},minmax(100px,.75fr)) minmax(105px,.8fr) minmax(85px,.55fr)`;
  const tableMinWidth = 650 + detailColumns.length * 115;
  const courseName = activeSection.courseCode ? `${activeSection.courseName} ${activeSection.courseCode}` : activeSection.courseName;
  const sectionHref = `/gradebook?period=${encodeURIComponent(selectedPeriod.code)}`;
  const allHref = `/gradebook?scope=all&period=${encodeURIComponent(selectedPeriod.code)}`;

  return <main className="app-shell">
    <header className="topbar"><div>
      <p className="eyebrow">Teacher Gradebook</p>
      <h1>{courseName}</h1>
      <p className="subtle">All Sections • live grades from the canonical grading engine</p>
      <TeacherSectionSwitcher sections={sections} activeSectionId={activeSection.sectionId} returnTo={allHref}/>
    </div></header>
    <TeacherPrimaryNav/>
    <SectionScopeNav
      sectionLabel={activeSection.sectionName}
      sectionHref={sectionHref}
      allLabel={`All Sections (${offeringSections.length})`}
      allHref={allHref}
      activeScope="all"
      ariaLabel="Gradebook section scope"
    />
    <section className={`content-wrap ${styles.content}`}>
      <article className={`panel ${styles.controls}`}>
        <div className="panel-header">
          <div><p className="eyebrow">Course view</p><h3>Current grades across sections</h3></div>
          <div className="grade-audit-header-actions"><Link className="secondary-link" href={`/assignments?scope=all&period=${encodeURIComponent(selectedPeriod.code)}`}>All Assignments</Link><Link className="secondary-link" href={`/analytics?scope=all&period=${encodeURIComponent(selectedPeriod.code)}`}>Analytics</Link></div>
        </div>
        <form method="get" className={styles.periodForm}>
          <input type="hidden" name="scope" value="all"/>
          <label><span>Grading period</span><select name="period" defaultValue={selectedPeriod.code} aria-label="Select grading period">{periods.map((period) => <option key={period.id} value={period.code}>{period.code} — {period.name}</option>)}</select></label>
          <button className="primary-button" type="submit">View Gradebook</button>
        </form>
      </article>

      <section className={`metric-grid ${styles.metrics}`} aria-label="Course gradebook summary">
        <article className="metric-card"><span className="metric-label">Active students</span><strong>{pooledRows.length}</strong></article>
        <article className="metric-card"><span className="metric-label">Course average</span><strong>{formatPercent(courseAverage)}</strong></article>
        <article className="metric-card"><span className="metric-label">Missing flags</span><strong>{missingCount}</strong></article>
        <article className="metric-card"><span className="metric-label">Unentered scores</span><strong>{unenteredCount}</strong></article>
      </section>

      <section className={styles.sectionSummaryGrid} aria-label="Section gradebook summaries">
        {sectionData.map(({ section, roster, calculation }) => {
          const calculated = calculation?.rows.filter((row) => row.overallPercent != null) ?? [];
          const average = calculated.length ? calculated.reduce((sum, row) => sum + (row.overallPercent ?? 0), 0) / calculated.length : null;
          const sectionMissing = calculation?.rows.reduce((sum, row) => sum + row.missingCount, 0) ?? 0;
          return <article className={styles.sectionSummaryCard} key={section.sectionId}>
            <div><strong>{sectionLabel(section)}</strong><small>{roster.length} active students</small></div>
            <div><span>Average</span><strong>{formatPercent(average)}</strong></div>
            <div><span>Missing</span><strong>{sectionMissing}</strong></div>
            <form action={setActiveTeacherSection}>
              <input type="hidden" name="sectionId" value={section.sectionId}/>
              <input type="hidden" name="returnTo" value={sectionHref}/>
              <button className="text-button" type="submit">Open section →</button>
            </form>
          </article>;
        })}
      </section>

      <article className={`panel full-width ${styles.tablePanel}`}>
        <div className="panel-header"><div><p className="eyebrow">{selectedPeriod.code}</p><h3>{firstCalculation?.mode === "composite" ? "Composite period overview" : selectedPeriod.periodRole === "exam" ? "Exam grade overview" : "Category grade overview"}</h3></div><span className="subtle">{gradedRows.length} of {pooledRows.length} students currently have a computed grade</span></div>
        <div className={styles.tableScroll}><div className={styles.table} style={{ minWidth: tableMinWidth }} role="table" aria-label={`${selectedPeriod.code} all sections gradebook`}>
          <div className={`${styles.row} ${styles.head}`} style={{ gridTemplateColumns: rowTemplate }} role="row"><span>Student / Section</span><span>Current {selectedPeriod.code}</span>{detailColumns.map((column) => <span key={column.key}>{column.label}</span>)}<span>Missing</span><span>Audit</span></div>
          {pooledRows.map(({ section, student, row, calculation }) => <div className={styles.row} style={{ gridTemplateColumns: rowTemplate }} role="row" key={`${section.sectionId}:${student.studentId}`}>
            <span className={styles.student}><strong>{student.displayName}</strong><small>{sectionLabel(section)}{student.email ? ` • ${student.email}` : ""}</small></span>
            <strong className={styles.overall}>{formatPercent(row?.overallPercent ?? null)}</strong>
            {detailColumns.map((column) => <span key={column.key}>{formatPercent(calculation?.mode === "composite" ? row?.componentPercents[column.key] ?? null : row?.categoryPercents[column.key] ?? null)}</span>)}
            <span className={styles.flags}>{row?.missingCount ? <span className="status warning-pill">{row.missingCount} missing</span> : <span className="status neutral-pill">0 missing</span>}{row?.unenteredCount ? <small>{row.unenteredCount} unentered</small> : null}</span>
            <form action={setActiveTeacherSection} className={styles.auditForm}><input type="hidden" name="sectionId" value={section.sectionId}/><input type="hidden" name="returnTo" value={`/gradebook/audit?studentId=${student.studentId}&period=${encodeURIComponent(selectedPeriod.code)}`}/><button className="text-button" type="submit">Audit →</button></form>
          </div>)}
        </div></div>
      </article>
    </section>
  </main>;
}
