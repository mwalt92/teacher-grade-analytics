export type GradingCategory = "participation" | "quiz" | "test";

export type GradeAttempt = {
  id: string;
  earned: number;
  possible: number;
  attemptNumber: number;
  occurredAt: string;
};

export type GradeRecord = {
  assignmentId: string;
  category: GradingCategory;
  missing: boolean;
  attempts: GradeAttempt[];
};

export type GradingRules = {
  categoryWeights: Record<GradingCategory, number>;
  dropLowest: Partial<Record<GradingCategory, number>>;
  retakePolicy: "highest" | "latest";
};

export type GradeAuditLine = {
  assignmentId: string;
  category: GradingCategory;
  percent: number;
  dropped: boolean;
};

export type GradeResult = {
  overallPercent: number | null;
  categoryPercents: Partial<Record<GradingCategory, number>>;
  audit: GradeAuditLine[];
};
