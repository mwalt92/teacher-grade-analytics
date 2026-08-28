import { describe, expect, it } from "vitest";
import { gradingCategoryFromName } from "./grade-calculation";

describe("gradingCategoryFromName", () => {
  it("preserves the current Calculus category codes", () => {
    expect(gradingCategoryFromName("Participation")).toBe("participation");
    expect(gradingCategoryFromName("Quizzes")).toBe("quiz");
    expect(gradingCategoryFromName("Tests")).toBe("test");
  });

  it("supports new configured category names instead of rejecting them", () => {
    expect(gradingCategoryFromName("Assessments")).toBe("assessment");
    expect(gradingCategoryFromName("Projects")).toBe("project");
    expect(gradingCategoryFromName("Written Practice")).toBe("written_practice");
  });
});
