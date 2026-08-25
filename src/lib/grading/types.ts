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
  assignmentTitle?: string;
  assignmentDate?: string;
  gradingPeriodCode?: string;
  category: GradingCategory;
  missing: boolean;
  exempt?: boolean;
  attempts: GradeAttempt[];
};

export type GradingRules = {
  categoryWeights: Record<GradingCategory, number>;
  dropLowest: Partial<Record<GradingCategory, number>>;
  retakePolicy: "highest" | "latest";
};

export type AttemptAuditLine = {
  attemptId: string;
  attemptNumber: number;
  earned: number;
  possible: number;
  percent: number;
  counted: boolean;
};

export type GradeAuditLine = {
  assignmentId: string;
  assignmentTitle?: string;
  assignmentDate?: string;
  gradingPeriodCode?: string;
  category: GradingCategory;
  status: "counted" | "dropped" | "missing" | "unentered" | "exempt";
  percent: number | null;
  countedAttemptId: string | null;
  countedAttemptNumber: number | null;
  dropped: boolean;
  missing: boolean;
  exempt: boolean;
  attempts: AttemptAuditLine[];
};

export type CategoryGradeResult = {
  category: GradingCategory;
  configuredWeight: number;
  activeWeight: number;
  averagePercent: number;
  weightedContribution: number;
  assignmentCount: number;
  droppedCount: number;
};

export type GradeResult = {
  overallPercent: number | null;
  activeWeight: number;
  categoryPercents: Partial<Record<GradingCategory, number>>;
  categories: Partial<Record<GradingCategory, CategoryGradeResult>>;
  audit: GradeAuditLine[];
};

export type SemesterComponent = {
  code: string;
  label: string;
  weight: number;
  percent: number | null;
};

export type SemesterComponentResult = SemesterComponent & {
  activeWeight: number;
  weightedContribution: number;
};

export type SemesterGradeResult = {
  overallPercent: number | null;
  activeWeight: number;
  components: SemesterComponentResult[];
};
