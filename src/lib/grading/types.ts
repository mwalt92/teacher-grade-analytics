export type GradingCategory = string;
export type CategoryCalculationMethod = "equal_assignment_percentage" | "total_points";

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
  pointsPossible: number;
  missing: boolean;
  exempt?: boolean;
  attempts: GradeAttempt[];
};

export type GradingRules = {
  categoryWeights: Record<GradingCategory, number>;
  dropLowest: Partial<Record<GradingCategory, number>>;
  calculationMethods: Partial<Record<GradingCategory, CategoryCalculationMethod>>;
  categoryLabels?: Partial<Record<GradingCategory, string>>;
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
  pointsPossible: number;
  countedEarned: number | null;
  countedPossible: number | null;
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
  label: string;
  calculationMethod: CategoryCalculationMethod;
  configuredWeight: number;
  activeWeight: number;
  averagePercent: number;
  weightedContribution: number;
  assignmentCount: number;
  droppedCount: number;
  pointsEarned: number;
  pointsPossible: number;
};

export type GradeResult = {
  overallPercent: number | null;
  activeWeight: number;
  categoryPercents: Record<GradingCategory, number>;
  categories: Record<GradingCategory, CategoryGradeResult>;
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
