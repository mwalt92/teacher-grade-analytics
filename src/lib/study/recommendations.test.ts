import { describe, expect, it } from "vitest";
import { bestAttemptPercent, selectSuggestedStudyGuide, type StudyRecommendationCandidate } from "./recommendations";

describe("bestAttemptPercent", () => {
  it("uses the best recorded attempt", () => {
    expect(bestAttemptPercent(20, [12, 16, 15])).toBe(80);
  });

  it("returns null when no usable score exists", () => {
    expect(bestAttemptPercent(20, [])).toBeNull();
    expect(bestAttemptPercent(0, [10])).toBeNull();
  });
});

describe("selectSuggestedStudyGuide", () => {
  const base: StudyRecommendationCandidate = {
    assignmentId: "a",
    attemptCount: 1,
    bestPercent: 75,
    allowRetakes: false,
    resourceCount: 2,
    recommendedCount: 0,
    missing: false,
    exempt: false,
    visibleToStudent: true,
  };

  it("prioritizes an actionable retake before a non-retake guide", () => {
    const result = selectSuggestedStudyGuide([
      { ...base, assignmentId: "low", bestPercent: 60 },
      { ...base, assignmentId: "retake", bestPercent: 85, allowRetakes: true },
    ]);
    expect(result?.assignmentId).toBe("retake");
  });

  it("chooses the lowest best percentage within the same retake state", () => {
    const result = selectSuggestedStudyGuide([
      { ...base, assignmentId: "higher", bestPercent: 82, allowRetakes: true },
      { ...base, assignmentId: "lower", bestPercent: 68, allowRetakes: true },
    ]);
    expect(result?.assignmentId).toBe("lower");
  });

  it("does not suggest missing, exempt, unattempted, resourceless, perfect-score, or draft guides", () => {
    const result = selectSuggestedStudyGuide([
      { ...base, assignmentId: "missing", missing: true },
      { ...base, assignmentId: "exempt", exempt: true },
      { ...base, assignmentId: "unattempted", attemptCount: 0, bestPercent: null },
      { ...base, assignmentId: "empty", resourceCount: 0 },
      { ...base, assignmentId: "perfect", bestPercent: 100 },
      { ...base, assignmentId: "draft", visibleToStudent: false },
    ]);
    expect(result).toBeNull();
  });

  it("uses teacher-recommended resource count as a tie breaker", () => {
    const result = selectSuggestedStudyGuide([
      { ...base, assignmentId: "plain", recommendedCount: 0 },
      { ...base, assignmentId: "featured", recommendedCount: 2 },
    ]);
    expect(result?.assignmentId).toBe("featured");
  });
});
