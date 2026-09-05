import { describe, expect, it } from "vitest";
import { getRubricById, proficiencyToGradebookScore } from "./rubrics";

describe("Computing Foundations rubric mappings", () => {
  it("maps the approved 4-point proficiency scale to 10-point gradebook scores", () => {
    const rubric = getRubricById("computing-u1-l1-prompt-refinement");
    expect(rubric).not.toBeNull();
    expect(proficiencyToGradebookScore(rubric!, 0)).toBe(0);
    expect(proficiencyToGradebookScore(rubric!, 1)).toBe(4);
    expect(proficiencyToGradebookScore(rubric!, 2)).toBe(6);
    expect(proficiencyToGradebookScore(rubric!, 3)).toBe(8);
    expect(proficiencyToGradebookScore(rubric!, 4)).toBe(10);
  });

  it("keeps Lesson 5 as one 4-point assignment with two 2-point diagnostics", () => {
    const rubric = getRubricById("computing-u1-l5-contradictions");
    expect(rubric).not.toBeNull();
    expect(rubric!.proficiencyPointsPossible).toBe(4);
    expect(rubric!.criteria.map((criterion) => criterion.maxPoints)).toEqual([2, 2]);
    expect(rubric!.criteria.reduce((sum, criterion) => sum + criterion.maxPoints, 0)).toBe(4);
  });
});
