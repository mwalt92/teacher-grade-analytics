export type AIConfidenceBand = "high" | "medium" | "review";
export type AIReviewStatus = "pending" | "approved" | "edited" | "rejected" | "missing" | "exempt";
export type AISubmissionState = "submitted" | "missing";

export type RubricCriterion = {
  key: string;
  label: string;
  maxPoints: number;
  description: string;
  fullCreditEvidence: string;
  partialCreditEvidence: string;
};

export type RubricTemplate = {
  id: string;
  version: number;
  title: string;
  source: string;
  lessonLabel: string;
  assignmentLabel: string;
  gradebookPointsPossible: number;
  proficiencyPointsPossible: number;
  scoreMap: Record<number, number>;
  criteria: RubricCriterion[];
};

export type QuestionDiagnostic = {
  criterionKey: string;
  label: string;
  earned: number;
  possible: number;
  confidence: number;
  evidenceSummary: string;
};

export type AIUsageRecord = {
  provider: string;
  model: string;
  inputTokens: number;
  cachedInputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  durationMs: number;
  escalated: boolean;
};

export type AIGradingRequest = {
  anonymousSubmissionId: string;
  rubric: RubricTemplate;
  questionText: string;
  responseText: string;
  lessonContext?: string;
};

export type AIGradingResult = {
  proficiencyEarned: number;
  proficiencyPossible: number;
  proposedPoints: number;
  gradebookPointsPossible: number;
  confidence: number;
  confidenceBand: AIConfidenceBand;
  reviewRequired: boolean;
  suggestedFeedback: string;
  conceptTags: string[];
  rationaleSummary: string;
  diagnostics: QuestionDiagnostic[];
  usage: AIUsageRecord;
};

export interface AIGradingProvider {
  readonly id: string;
  grade(request: AIGradingRequest): Promise<AIGradingResult>;
}
