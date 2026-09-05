export type StudyRecommendationCandidate = {
  assignmentId: string;
  attemptCount: number;
  bestPercent: number | null;
  allowRetakes: boolean;
  resourceCount: number;
  recommendedCount: number;
  missing: boolean;
  exempt: boolean;
  visibleToStudent?: boolean;
};

export function bestAttemptPercent(pointsPossible: number, attempts: Array<number | string | null | undefined>) {
  if (!Number.isFinite(pointsPossible) || pointsPossible <= 0) return null;

  const scores = attempts
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!scores.length) return null;

  return (Math.max(...scores) / pointsPossible) * 100;
}

export function selectSuggestedStudyGuide<T extends StudyRecommendationCandidate>(guides: T[]) {
  const eligible = guides.filter((guide) =>
    guide.visibleToStudent !== false
    && !guide.missing
    && !guide.exempt
    && guide.attemptCount > 0
    && guide.resourceCount > 0
    && guide.bestPercent != null
    && guide.bestPercent < 100,
  );

  if (!eligible.length) return null;

  return [...eligible].sort((a, b) => {
    if (a.allowRetakes !== b.allowRetakes) return a.allowRetakes ? -1 : 1;
    if (a.bestPercent !== b.bestPercent) return (a.bestPercent ?? 100) - (b.bestPercent ?? 100);
    if (a.recommendedCount !== b.recommendedCount) return b.recommendedCount - a.recommendedCount;
    return a.assignmentId.localeCompare(b.assignmentId);
  })[0];
}
