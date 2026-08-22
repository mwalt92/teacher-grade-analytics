import { describe, expect, it } from "vitest";
import { calculateGrade } from "./engine";
import type { GradeRecord, GradingRules } from "./types";

const rules: GradingRules = {
  categoryWeights: { participation: 0.1, quiz: 0.3, test: 0.6 },
  dropLowest: { quiz: 1 },
  retakePolicy: "highest",
};

describe("calculateGrade", () => {
  it("drops the lowest eligible quiz", () => {
    const records: GradeRecord[] = [80, 70, 90].map((score, index) => ({
      assignmentId: `q${index + 1}`,
      category: "quiz",
      missing: false,
      attempts: [{ id: `a${index + 1}`, earned: score, possible: 100, attemptNumber: 1, occurredAt: "2026-08-22" }],
    }));

    const result = calculateGrade(records, rules);
    expect(result.categoryPercents.quiz).toBe(85);
    expect(result.audit.find((line) => line.assignmentId === "q2")?.dropped).toBe(true);
  });

  it("uses the highest retake attempt", () => {
    const records: GradeRecord[] = [{
      assignmentId: "q1",
      category: "quiz",
      missing: false,
      attempts: [
        { id: "a1", earned: 14, possible: 20, attemptNumber: 1, occurredAt: "2026-08-18" },
        { id: "a2", earned: 18, possible: 20, attemptNumber: 2, occurredAt: "2026-08-22" },
      ],
    }];

    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.categoryPercents.quiz).toBe(90);
  });

  it("treats missing work with no attempt as zero", () => {
    const records: GradeRecord[] = [{ assignmentId: "p1", category: "participation", missing: true, attempts: [] }];
    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.categoryPercents.participation).toBe(0);
    expect(result.overallPercent).toBe(0);
  });
});
