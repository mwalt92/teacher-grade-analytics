"use client";

import { useMemo, useState } from "react";
import { Plus, RotateCcw, Sparkles, Trash2 } from "lucide-react";
import { calculateGrade, calculateSemesterGrade } from "@/lib/grading/engine";
import type { GradingCategory } from "@/lib/grading/types";
import type { GradeSimulatorData } from "@/lib/data/student-dashboard";
import styles from "./grade-simulator.module.css";

type Scenario = {
  id: string;
  category: GradingCategory;
  earned: string;
  possible: string;
  late: boolean;
};

const categoryLabels: Record<GradingCategory, string> = {
  participation: "Participation",
  quiz: "Quiz",
  test: "Test",
};

function newScenario(id: string): Scenario {
  return { id, category: "quiz", earned: "", possible: "10", late: false };
}

function formatPercent(value: number | null, digits = 1) {
  return value === null ? "—" : `${value.toFixed(digits)}%`;
}

function formatDelta(projected: number | null, current: number | null) {
  if (projected === null || current === null) return "—";
  const delta = projected - current;
  return `${delta >= 0 ? "+" : ""}${delta.toFixed(1)}`;
}

export function GradeSimulator({ data }: { data: GradeSimulatorData }) {
  const [scenarios, setScenarios] = useState<Scenario[]>([newScenario("scenario-1")]);
  const [nextId, setNextId] = useState(2);
  const [retakeAssignmentId, setRetakeAssignmentId] = useState("");
  const [retakeEarned, setRetakeEarned] = useState("");
  const [targetSemesterGrade, setTargetSemesterGrade] = useState("60");

  const projection = useMemo(() => {
    const validScenarios = scenarios.flatMap((scenario) => {
      if (scenario.earned.trim() === "" || scenario.possible.trim() === "") return [];
      const earned = Number(scenario.earned);
      const possible = Number(scenario.possible);
      if (!Number.isFinite(earned) || !Number.isFinite(possible) || earned < 0 || possible <= 0) return [];
      const deduction = scenario.late ? data.lateDeductions[scenario.category] : 0;
      const effectiveEarned = earned * Math.max(0, 1 - deduction);
      return [{ scenario, earned, possible, deduction, effectiveEarned }];
    });

    const selectedRetake = data.retakeOptions.find((option) => option.assignmentId === retakeAssignmentId) ?? null;
    const retakeScore = Number(retakeEarned);
    const validRetake = Boolean(
      selectedRetake
      && retakeEarned.trim() !== ""
      && Number.isFinite(retakeScore)
      && retakeScore >= 0,
    );

    const recordsWithRetake = validRetake && selectedRetake
      ? data.records.map((record) => record.assignmentId === selectedRetake.assignmentId
        ? {
            ...record,
            missing: false,
            attempts: [...record.attempts, {
              id: `simulator-retake-${selectedRetake.assignmentId}`,
              earned: retakeScore,
              possible: selectedRetake.pointsPossible,
              attemptNumber: selectedRetake.nextAttemptNumber,
              occurredAt: "2099-12-31",
            }],
          }
        : record)
      : data.records;

    const hypotheticalRecords = validScenarios.map(({ scenario, possible, effectiveEarned }) => ({
      assignmentId: `simulator-${scenario.id}`,
      assignmentTitle: "Hypothetical assignment",
      assignmentDate: "2099-12-31",
      gradingPeriodCode: data.quarterCode,
      category: scenario.category,
      missing: false,
      exempt: false,
      attempts: [{
        id: `simulator-attempt-${scenario.id}`,
        earned: effectiveEarned,
        possible,
        attemptNumber: 1,
        occurredAt: "2099-12-31",
      }],
    }));

    const quarter = calculateGrade([...recordsWithRetake, ...hypotheticalRecords], data.rules);
    const projectedSemesterComponents = data.semesterComponents.map((component) => ({
      ...component,
      percent: component.code === data.quarterCode ? quarter.overallPercent : component.percent,
    }));
    const semester = calculateSemesterGrade(projectedSemesterComponents);
    const auditByScenario = new Map(
      quarter.audit
        .filter((line) => line.assignmentId.startsWith("simulator-scenario-"))
        .map((line) => [line.assignmentId.replace("simulator-", ""), line]),
    );
    const retakeAudit = selectedRetake
      ? quarter.audit.find((line) => line.assignmentId === selectedRetake.assignmentId) ?? null
      : null;

    const target = Number(targetSemesterGrade);
    const examComponent = projectedSemesterComponents.find((component) => component.code === "EXAM") ?? null;
    const quarterComponents = projectedSemesterComponents.filter((component) => /^Q[1-4]$/.test(component.code));
    const finalTargetReady = Boolean(
      examComponent
      && examComponent.weight > 0
      && quarterComponents.length === 2
      && quarterComponents.every((component) => component.percent !== null),
    );
    let requiredExamPercent: number | null = null;
    if (finalTargetReady && examComponent && Number.isFinite(target)) {
      const totalWeight = projectedSemesterComponents.reduce((sum, component) => sum + component.weight, 0);
      const nonExamContribution = projectedSemesterComponents
        .filter((component) => component.code !== "EXAM")
        .reduce((sum, component) => sum + (component.percent ?? 0) * component.weight, 0);
      requiredExamPercent = (target * totalWeight - nonExamContribution) / examComponent.weight;
    }

    return {
      quarter,
      semester,
      validScenarios,
      auditByScenario,
      selectedRetake,
      validRetake,
      retakeAudit,
      finalTargetReady,
      requiredExamPercent,
      target,
      quarterComponents,
    };
  }, [data, retakeAssignmentId, retakeEarned, scenarios, targetSemesterGrade]);

  function patchScenario(id: string, patch: Partial<Scenario>) {
    setScenarios((current) => current.map((scenario) => scenario.id === id ? { ...scenario, ...patch } : scenario));
  }

  function addScenario() {
    const id = `scenario-${nextId}`;
    setNextId((value) => value + 1);
    setScenarios((current) => [...current, newScenario(id)]);
  }

  function removeScenario(id: string) {
    setScenarios((current) => current.length === 1 ? [newScenario("scenario-1")] : current.filter((scenario) => scenario.id !== id));
  }

  function reset() {
    setScenarios([newScenario("scenario-1")]);
    setNextId(2);
    setRetakeAssignmentId("");
    setRetakeEarned("");
    setTargetSemesterGrade("60");
  }

  const retakeStatus = projection.validRetake && projection.selectedRetake && projection.retakeAudit
    ? projection.retakeAudit.dropped
      ? "Assignment is dropped by the quiz rule"
      : projection.retakeAudit.countedAttemptNumber === projection.selectedRetake.nextAttemptNumber
        ? "New retake becomes the counting attempt"
        : "Current best attempt still counts"
    : null;

  return <article className={`panel full-width ${styles.simulator}`}>
    <div className={styles.header}>
      <div>
        <p className="eyebrow">Grade Simulator</p>
        <h3>What would my grade be if…?</h3>
        <p className="subtle">Experiment freely. Nothing here changes your real grade.</p>
      </div>
      <button className="secondary-link" type="button" onClick={reset}><RotateCcw size={15}/> Reset</button>
    </div>

    <section className={styles.projectionGrid} aria-label="Projected grades">
      <div className={styles.projectionCard}><span>Current {data.quarterCode}</span><strong>{formatPercent(data.currentQuarterPercent)}</strong></div>
      <div className={`${styles.projectionCard} ${styles.projected}`}><span>Projected {data.quarterCode}</span><strong>{formatPercent(projection.quarter.overallPercent)}</strong><small>{formatDelta(projection.quarter.overallPercent, data.currentQuarterPercent)} pts</small></div>
      <div className={styles.projectionCard}><span>Current {data.semesterCode}</span><strong>{formatPercent(data.currentSemesterPercent)}</strong></div>
      <div className={`${styles.projectionCard} ${styles.projected}`}><span>Projected {data.semesterCode}</span><strong>{formatPercent(projection.semester.overallPercent)}</strong><small>{formatDelta(projection.semester.overallPercent, data.currentSemesterPercent)} pts</small></div>
    </section>

    <div className={styles.explainer}><Sparkles size={17}/><span>The simulator uses the same category weights, dynamic weighting, best-attempt retake policy, and lowest-score drop rules as the real gradebook. Late deductions come from this course&apos;s category settings.</span></div>

    <section className={styles.scenarioSection}>
      <div className={styles.sectionHeading}><div><strong>Hypothetical future assignments</strong><span>Add more than one to model a sequence of upcoming scores.</span></div><button className="secondary-link" type="button" onClick={addScenario}><Plus size={15}/> Add another</button></div>
      <div className={styles.scenarioList}>
        {scenarios.map((scenario, index) => {
          const deduction = data.lateDeductions[scenario.category];
          const earned = Number(scenario.earned);
          const possible = Number(scenario.possible);
          const valid = Number.isFinite(earned) && Number.isFinite(possible) && earned >= 0 && possible > 0 && scenario.earned.trim() !== "";
          const adjusted = valid ? earned * Math.max(0, 1 - (scenario.late ? deduction : 0)) : null;
          const audit = projection.auditByScenario.get(scenario.id);
          return <div className={styles.scenarioRow} key={scenario.id}>
            <div className={styles.scenarioNumber}>{index + 1}</div>
            <label><span>Type</span><select value={scenario.category} onChange={(event) => patchScenario(scenario.id, { category: event.target.value as GradingCategory, late: false })}><option value="participation">Participation</option><option value="quiz">Quiz</option><option value="test">Test</option></select></label>
            <label><span>Points earned</span><input type="number" min="0" step="0.5" inputMode="decimal" value={scenario.earned} onChange={(event) => patchScenario(scenario.id, { earned: event.target.value })} placeholder="8.5"/></label>
            <label><span>Points possible</span><input type="number" min="0.01" step="0.5" inputMode="decimal" value={scenario.possible} onChange={(event) => patchScenario(scenario.id, { possible: event.target.value })}/></label>
            <label className={`${styles.lateControl} ${deduction <= 0 ? styles.lateDisabled : ""}`}><span>Late?</span><span className={styles.checkboxLine}><input type="checkbox" checked={scenario.late && deduction > 0} disabled={deduction <= 0} onChange={(event) => patchScenario(scenario.id, { late: event.target.checked })}/>{deduction > 0 ? `${Math.round(deduction * 100)}% deduction` : "No penalty"}</span></label>
            <div className={styles.scenarioResult}><span>Counts as</span><strong>{adjusted === null || !valid ? "—" : `${adjusted.toFixed(1)}/${possible}`}</strong>{audit ? <small className={audit.dropped ? styles.dropped : styles.counted}>{audit.dropped ? "Dropped by rule" : `${audit.percent?.toFixed(1) ?? "—"}%`}</small> : <small>Enter a score</small>}</div>
            <button className={styles.removeButton} type="button" aria-label={`Remove hypothetical assignment ${index + 1}`} onClick={() => removeScenario(scenario.id)}><Trash2 size={16}/></button>
          </div>;
        })}
      </div>
    </section>

    <section className={styles.toolGrid}>
      <div className={styles.toolCard}>
        <div className={styles.sectionHeading}><div><strong>What if I retake this assessment?</strong><span>Choose a scored Quiz or Test that allows retakes.</span></div></div>
        {data.retakeOptions.length ? <div className={styles.retakeFields}>
          <label><span>Assessment</span><select value={retakeAssignmentId} onChange={(event) => { setRetakeAssignmentId(event.target.value); setRetakeEarned(""); }}><option value="">Choose an assessment</option>{data.retakeOptions.map((option) => <option key={option.assignmentId} value={option.assignmentId}>{option.title} • best {formatPercent(option.currentBestPercent)}</option>)}</select></label>
          {projection.selectedRetake ? <>
            <label><span>New retake score</span><span className={styles.scoreWithPossible}><input type="number" min="0" step="0.5" inputMode="decimal" value={retakeEarned} onChange={(event) => setRetakeEarned(event.target.value)} placeholder="Enter points"/><strong>/ {projection.selectedRetake.pointsPossible}</strong></span></label>
            <div className={styles.toolResult}><span>Current best</span><strong>{formatPercent(projection.selectedRetake.currentBestPercent)}</strong><small>Retake #{projection.selectedRetake.nextAttemptNumber}</small></div>
            <div className={styles.toolResult}><span>Projected result</span><strong>{projection.retakeAudit ? formatPercent(projection.retakeAudit.percent) : "—"}</strong><small className={retakeStatus?.includes("counting") ? styles.counted : retakeStatus?.includes("dropped") ? styles.dropped : ""}>{retakeStatus ?? "Enter a retake score"}</small></div>
          </> : null}
        </div> : <p className={styles.toolEmpty}>There are no scored Quiz/Test assignments in this quarter that currently allow retakes.</p>}
      </div>

      <div className={styles.toolCard}>
        <div className={styles.sectionHeading}><div><strong>What do I need on the final?</strong><span>Set the semester grade you want to finish with.</span></div></div>
        <div className={styles.finalTargetBody}>
          <label><span>Target {data.semesterCode} grade</span><span className={styles.targetInput}><input type="number" min="0" max="100" step="0.5" inputMode="decimal" value={targetSemesterGrade} onChange={(event) => setTargetSemesterGrade(event.target.value)}/><strong>%</strong></span></label>
          {projection.finalTargetReady && projection.requiredExamPercent !== null && Number.isFinite(projection.target) ? <div className={styles.finalAnswer}>
            <span>Required semester exam score</span>
            <strong>{`${Math.max(0, projection.requiredExamPercent).toFixed(1)}%`}</strong>
            <small>{projection.requiredExamPercent > 100
              ? `That target would require ${projection.requiredExamPercent.toFixed(1)}%, so it is not reachable through the final alone.`
              : projection.requiredExamPercent <= 0
                ? `Your projected quarter grades already secure at least ${projection.target.toFixed(1)}% even with a 0% final.`
                : `Score at least this percentage on the ${data.semesterCode} exam to finish at ${projection.target.toFixed(1)}%.`}</small>
          </div> : <div className={styles.finalUnavailable}>
            <strong>Exact answer not available yet</strong>
            <span>The final semester formula needs both quarter grades. Once both are available, this will solve the 40% + 40% + 20% formula exactly.</span>
          </div>}
        </div>
      </div>
    </section>

    <section className={styles.categoryProjection}>
      <div className={styles.sectionHeading}><div><strong>Projected category averages</strong><span>These update after retakes and drop-lowest rules are applied.</span></div></div>
      <div className={styles.categoryCards}>
        {(["participation", "quiz", "test"] as GradingCategory[]).map((category) => {
          const result = projection.quarter.categories[category];
          return <div className={styles.categoryCard} key={category}><span>{categoryLabels[category]}</span><strong>{formatPercent(result?.averagePercent ?? null)}</strong><small>{result ? `${result.assignmentCount} counting${result.droppedCount ? ` • ${result.droppedCount} dropped` : ""}` : "No grade data"}</small></div>;
        })}
      </div>
    </section>
  </article>;
}
