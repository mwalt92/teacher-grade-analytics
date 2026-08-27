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

  const projection = useMemo(() => {
    const validScenarios = scenarios.flatMap((scenario) => {
      const earned = Number(scenario.earned);
      const possible = Number(scenario.possible);
      if (!Number.isFinite(earned) || !Number.isFinite(possible) || earned < 0 || possible <= 0) return [];
      const deduction = scenario.late ? data.lateDeductions[scenario.category] : 0;
      const effectiveEarned = earned * Math.max(0, 1 - deduction);
      return [{ scenario, earned, possible, deduction, effectiveEarned }];
    });

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

    const quarter = calculateGrade([...data.records, ...hypotheticalRecords], data.rules);
    const semester = calculateSemesterGrade(data.semesterComponents.map((component) => ({
      ...component,
      percent: component.code === data.quarterCode ? quarter.overallPercent : component.percent,
    })));
    const auditByScenario = new Map(
      quarter.audit
        .filter((line) => line.assignmentId.startsWith("simulator-"))
        .map((line) => [line.assignmentId.replace("simulator-", ""), line]),
    );

    return { quarter, semester, validScenarios, auditByScenario };
  }, [data, scenarios]);

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
  }

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

    <div className={styles.explainer}><Sparkles size={17}/><span>The simulator uses the same category weights, dynamic weighting, retake policy, and lowest-score drop rules as the real gradebook. Late deductions come from this course's category settings.</span></div>

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

    <section className={styles.categoryProjection}>
      <div className={styles.sectionHeading}><div><strong>Projected category averages</strong><span>These update after drop-lowest rules are applied.</span></div></div>
      <div className={styles.categoryCards}>
        {(["participation", "quiz", "test"] as GradingCategory[]).map((category) => {
          const result = projection.quarter.categories[category];
          return <div className={styles.categoryCard} key={category}><span>{categoryLabels[category]}</span><strong>{formatPercent(result?.averagePercent ?? null)}</strong><small>{result ? `${result.assignmentCount} counting${result.droppedCount ? ` • ${result.droppedCount} dropped` : ""}` : "No grade data"}</small></div>;
        })}
      </div>
    </section>
  </article>;
}
