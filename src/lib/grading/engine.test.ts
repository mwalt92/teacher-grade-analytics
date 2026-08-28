import { describe, expect, it } from "vitest";
import { calculateGrade, calculateSemesterGrade, selectCountedAttempt } from "./engine";
import type { GradeRecord, GradingRules } from "./types";

const rules: GradingRules = {
  categoryWeights: { participation: 0.1, quiz: 0.3, test: 0.6 },
  dropLowest: { quiz: 1 },
  calculationMethods: {
    participation: "equal_assignment_percentage",
    quiz: "equal_assignment_percentage",
    test: "equal_assignment_percentage",
  },
  retakePolicy: "highest",
};

describe("canonical grading engine", () => {
  it("drops the lowest eligible quiz and exposes the decision in the audit", () => {
    const records: GradeRecord[] = [80, 70, 90].map((score, index) => ({
      assignmentId: `q${index + 1}`,
      assignmentDate: `2026-08-${20 + index}`,
      category: "quiz",
      pointsPossible: 100,
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
      pointsPossible: 20,
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
    const records: GradeRecord[] = [{ assignmentId: "p1", category: "participation", pointsPossible: 10, missing: true, attempts: [] }];
    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.categoryPercents.participation).toBe(0);
    expect(result.overallPercent).toBe(0);
    expect(result.audit[0].status).toBe("missing");
    expect(result.audit[0].countedPossible).toBe(10);
  });

  it("ignores truly unentered and exempt assignments", () => {
    const records: GradeRecord[] = [
      { assignmentId: "p1", category: "participation", pointsPossible: 10, missing: false, attempts: [] },
      { assignmentId: "q1", category: "quiz", pointsPossible: 10, missing: false, exempt: true, attempts: [{ id: "a1", earned: 0, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "t1", category: "test", pointsPossible: 100, missing: false, attempts: [{ id: "a2", earned: 80, possible: 100, attemptNumber: 1, occurredAt: "2026-08-22" }] },
    ];

    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.overallPercent).toBe(80);
    expect(result.audit.find((line) => line.assignmentId === "p1")?.status).toBe("unentered");
    expect(result.audit.find((line) => line.assignmentId === "q1")?.status).toBe("exempt");
  });

  it("renormalizes category weights over only categories that currently have grade data", () => {
    const records: GradeRecord[] = [
      { assignmentId: "p1", category: "participation", pointsPossible: 10, missing: false, attempts: [{ id: "p1a", earned: 10, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "q1", category: "quiz", pointsPossible: 10, missing: false, attempts: [{ id: "q1a", earned: 8, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
    ];

    const result = calculateGrade(records, { ...rules, dropLowest: {} });
    expect(result.activeWeight).toBeCloseTo(0.4);
    expect(result.overallPercent).toBeCloseTo(85);
  });

  it("supports total-points calculation for an arbitrary configured category", () => {
    const assessmentRules: GradingRules = {
      categoryWeights: { assessment: 1 },
      dropLowest: {},
      calculationMethods: { assessment: "total_points" },
      categoryLabels: { assessment: "Assessments" },
      retakePolicy: "highest",
    };
    const records: GradeRecord[] = [
      { assignmentId: "a", category: "assessment", pointsPossible: 10, missing: false, attempts: [{ id: "aa", earned: 10, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "b", category: "assessment", pointsPossible: 50, missing: false, attempts: [{ id: "ba", earned: 25, possible: 50, attemptNumber: 1, occurredAt: "2026-08-23" }] },
    ];

    const result = calculateGrade(records, assessmentRules);
    expect(result.categoryPercents.assessment).toBeCloseTo(58.3333333);
    expect(result.categories.assessment.calculationMethod).toBe("total_points");
    expect(result.categories.assessment.pointsEarned).toBe(35);
    expect(result.categories.assessment.pointsPossible).toBe(60);
    expect(result.categories.assessment.label).toBe("Assessments");
  });

  it("keeps equal-assignment weighting available for differently sized assignments", () => {
    const equalRules: GradingRules = {
      categoryWeights: { assessment: 1 },
      dropLowest: {},
      calculationMethods: { assessment: "equal_assignment_percentage" },
      retakePolicy: "highest",
    };
    const records: GradeRecord[] = [
      { assignmentId: "a", category: "assessment", pointsPossible: 10, missing: false, attempts: [{ id: "aa", earned: 10, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "b", category: "assessment", pointsPossible: 50, missing: false, attempts: [{ id: "ba", earned: 25, possible: 50, attemptNumber: 1, occurredAt: "2026-08-23" }] },
    ];

    const result = calculateGrade(records, equalRules);
    expect(result.categoryPercents.assessment).toBe(75);
  });

  it("includes a Missing assignment denominator in total-points mode", () => {
    const pointRules: GradingRules = {
      categoryWeights: { project: 1 },
      dropLowest: {},
      calculationMethods: { project: "total_points" },
      retakePolicy: "highest",
    };
    const records: GradeRecord[] = [
      { assignmentId: "p1", category: "project", pointsPossible: 10, missing: false, attempts: [{ id: "p1a", earned: 10, possible: 10, attemptNumber: 1, occurredAt: "2026-08-22" }] },
      { assignmentId: "p2", category: "project", pointsPossible: 50, missing: true, attempts: [] },
    ];

    const result = calculateGrade(records, pointRules);
    expect(result.categoryPercents.project).toBeCloseTo(16.6666667);
    expect(result.categories.project.pointsPossible).toBe(60);
  });

  it("computes configured composite periods dynamically from available components", () => {
    const current = calculateSemesterGrade([
      { code: "BLOCK_A", label: "First block", role: "standard", weight: 0.4, percent: 90 },
      { code: "BLOCK_B", label: "Second block", role: "standard", weight: 0.4, percent: 80 },
      { code: "CAPSTONE", label: "Capstone exam", role: "exam", weight: 0.2, percent: null },
    ]);
    expect(current.activeWeight).toBeCloseTo(0.8);
    expect(current.overallPercent).toBeCloseTo(85);
    expect(current.components.find((component) => component.role === "exam")?.code).toBe("CAPSTONE");

    const complete = calculateSemesterGrade([
      { code: "BLOCK_A", label: "First block", role: "standard", weight: 0.4, percent: 90 },
      { code: "BLOCK_B", label: "Second block", role: "standard", weight: 0.4, percent: 80 },
      { code: "CAPSTONE", label: "Capstone exam", role: "exam", weight: 0.2, percent: 100 },
    ]);
    expect(complete.overallPercent).toBeCloseTo(88);
  });
});