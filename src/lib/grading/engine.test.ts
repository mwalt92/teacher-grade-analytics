import { describe, expect, it } from "vitest";
import { calculateGrade, calculateSemesterGrade, selectCountedAttempt } from "./engine";
import type { GradeRecord, GradingRules } from "./types";

const rules: GradingRules = {
  categoryWeights: { participation: 0.1, quiz: 0.3, test: 0.6 },
  dropLowest: { quiz: 1 },
  retakePolicy: "highest",
};

describe("canonical grading engine", () => {
  it("drops the lowest eligible quiz and exposes the decision in the audit", () => {
    const records: GradeRecord[] = [80, 70, 90].map((score, index) => ({
      assignmentId: `q${index + 1}`,
      assignmentDate: `2026-08-${20 + index}`,
      category: "quiz",
      missing: false,
      attempts: [{ id: `a${index + 1}`, earned: score, possible: 100, attemptNumber: 1, occurredAt: "2026-08-22" }],
    }));

    const result = calculateGrade(records, rules);
    expect(result.categoryPercents.quiz).toBe(85);
    expect(result.audit.find((line) => line.assignmentId === "q2")?.status).toBe("dropped");
    expect(result.categories.quiz?.droppedCount).toBe(1);
  });

  it("uses the highest retake percentage and breaks exact ties with the earliest attempt", () => {
    const record: GradeRecord = {
      assignmentId: "q1",
      category: "quiz",
      missing: false,
      attempts: [
        { id: "a1", earned: 18, possible: 20, attemptNumber: 1, occurredAt: "2026-08-18" },
        { id: "a2", earned: 9, possible: 10, attemptNumber: 2, occurredAt: "2026-08-22" },
      ],
    };

    expect(selectCountedAttempt(record, "highest")?.id).toBe("a1");
    const result = calculateGrade([record], { ...rules, dropLowest: {} });
    expect(result.categoryPercents.quiz).toBe(90);
    expect(result.audit[0].countedAttemptNumber).toBe(1);
  });

  it("treats missing work with no attempt as zero", () => {
    const records: GradeRecord[] = [{ assignmentId: "p1", category: "participation", missing: true, attempts: [] }];
    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.categoryPercents.participation).toBe(0);
    expect(result.overallPercent).toBe(0);
    expect(result.audit[0].status).toBe("missing");
  });

  it("ignores truly unentered and exempt assignments", () => {
    const records: GradeRecord[] = [
      { assignmentId: "p1", category: "participation", missing: false, attempts: [] },
      { assignmentId: "q1", category: "quiz", missing: false, exempt: true, attempts: [{ id: "a1", earned: 0, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "t1", category: "test", missing: false, attempts: [{ id: "a2", earned: 80, possible: 100, attemptNumber: 1, occurredAt: "2026-08-22" }] },
    ];

    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.overallPercent).toBe(80);
    expect(result.audit.find((line) => line.assignmentId === "p1")?.status).toBe("unentered");
    expect(result.audit.find((line) => line.assignmentId === "q1")?.status).toBe("exempt");
  });

  it("renormalizes category weights over only categories that currently have grade data", () => {
    const records: GradeRecord[] = [
      { assignmentId: "p1", category: "participation", missing: false, attempts: [{ id: "p1a", earned: 10, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "q1", category: "quiz", missing: false, attempts: [{ id: "q1a", earned: 8, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
    ];

    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.activeWeight).toBeCloseTo(0.4);
    expect(result.overallPercent).toBeCloseTo(85);
  });

  it("computes semester grades dynamically from available components", () => {
    const current = calculateSemesterGrade([
      { code: "Q1", label: "Quarter 1", weight: 0.4, percent: 90 },
      { code: "Q2", label: "Quarter 2", weight: 0.4, percent: 80 },
      { code: "EXAM", label: "Semester Exam", weight: 0.2, percent: null },
    ]);
    expect(current.activeWeight).toBeCloseTo(0.8);
    expect(current.overallPercent).toBeCloseTo(85);

    const complete = calculateSemesterGrade([
      { code: "Q1", label: "Quarter 1", weight: 0.4, percent: 90 },
      { code: "Q2", label: "Quarter 2", weight: 0.4, percent: 80 },
      { code: "EXAM", label: "Semester Exam", weight: 0.2, percent: 100 },
    ]);
    expect(complete.overallPercent).toBeCloseTo(88);
  });
});
