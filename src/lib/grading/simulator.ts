import { calculateGrade } from "./engine";
import { applyLateDeduction, type LateWorkRules } from "./policies";
import type { GradeRecord, GradeResult, GradingRules } from "./types";

export type SimulationChange = {
  assignmentId: string;
  earned: number;
  possible: number;
  late?: boolean;
};

export type SimulationResult = {
  current: GradeResult;
  simulated: GradeResult;
  delta: number | null;
};

export function simulateGrade(
  records: GradeRecord[],
  gradingRules: GradingRules,
  lateWorkRules: LateWorkRules,
  changes: SimulationChange[],
): SimulationResult {
  const current = calculateGrade(records, gradingRules);
  const changeMap = new Map(changes.map((change) => [change.assignmentId, change]));

  const simulatedRecords = records.map((record) => {
    const change = changeMap.get(record.assignmentId);
    if (!change) return structuredClone(record);
    if (change.possible <= 0) throw new Error("Points possible must be greater than zero.");

    const rawPercent = (change.earned / change.possible) * 100;
    const deductionRate = lateWorkRules[record.category]?.deductionRate ?? 0;
    const adjustedPercent = change.late ? applyLateDeduction(rawPercent, deductionRate) : rawPercent;
    const adjustedEarned = (adjustedPercent / 100) * change.possible;

    return {
      ...structuredClone(record),
      pointsPossible: change.possible,
      missing: false,
      attempts: [
        ...record.attempts,
        {
          id: `simulation-${record.assignmentId}`,
          earned: adjustedEarned,
          possible: change.possible,
          attemptNumber: Math.max(0, ...record.attempts.map((attempt) => attempt.attemptNumber)) + 1,
          occurredAt: "simulation",
        },
      ],
    };
  });

  const simulated = calculateGrade(simulatedRecords, gradingRules);
  const delta = current.overallPercent === null || simulated.overallPercent === null
    ? null
    : simulated.overallPercent - current.overallPercent;

  return { current, simulated, delta };
}
