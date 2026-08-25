import { describe, expect, it } from "vitest";
import { gradingCategoryFromName } from "./grade-calculation";

describe("gradingCategoryFromName", () => {
  it("maps the live category names to canonical grading categories", () => {
    expect(gradingCategoryFromName("Participation")).toBe("participation");
    expect(gradingCategoryFromName("Quizzes")).toBe("quiz");
    expect(gradingCategoryFromName("Tests")).toBe("test");
  });

  it("fails loudly for unsupported categories instead of silently misgrading", () => {
    expect(() => gradingCategoryFromName("Projects")).toThrow("Unsupported grading category");
  });
});
