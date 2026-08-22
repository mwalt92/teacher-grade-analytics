import { describe, expect, it } from "vitest";
import { defaultLateWorkRules } from "./policies";
import { simulateGrade } from "./simulator";
import type { GradeRecord, GradingRules } from "./types";

const rules: GradingRules = {
  categoryWeights: { participation: 0.1, quiz: 0.3, test: 0.6 },
  dropLowest: {},
  retakePolicy: "highest",
};

describe("simulateGrade", () => {
  it("applies the category late-work deduction to a simulated makeup", () => {
    const records: GradeRecord[] = [{
      assignmentId: "p1",
      category: "participation",
      missing: true,
      attempts: [],
    }];

    const result = simulateGrade(records, rules, defaultLateWorkRules, [
      { assignmentId: "p1", earned: 10, possible: 10, late: true },
    ]);

    expect(result.current.overallPercent).toBe(0);
    expect(result.simulated.overallPercent).toBe(50);
    expect(result.delta).toBe(50);
  });

  it("does not mutate the real grade records", () => {
    const records: GradeRecord[] = [{
      assignmentId: "q1",
      category: "quiz",
      missing: true,
      attempts: [],
    }];

    simulateGrade(records, rules, defaultLateWorkRules, [
      { assignmentId: "q1", earned: 18, possible: 20, late: false },
    ]);

    expect(records[0].missing).toBe(true);
    expect(records[0].attempts).toHaveLength(0);
  });
});
