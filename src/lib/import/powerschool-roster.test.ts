import { describe, expect, it } from "vitest";
import { parsePowerSchoolRows, splitPowerSchoolName } from "./powerschool-roster";

describe("PowerSchool roster parser", () => {
  it("groups a multi-course export without duplicating rows", () => {
    const preview = parsePowerSchoolRows([
      ["Name", "Student Number", "Course"],
      ["Sherk, Tristan", "1001", "2(A) Computing Foundations"],
      ["Sherk, Tristan", "1001", "1(A) Pre-Calculus/M125 IU"],
      ["Amor, Konnor", "1002", "4(A) Calculus / M211"],
    ]);

    expect(preview.rows).toHaveLength(3);
    expect(preview.courseGroups).toHaveLength(3);
    expect(preview.hasStudentNumbers).toBe(true);
    expect(preview.rows.filter((row) => row.studentNumber === "1001")).toHaveLength(2);
  });

  it("flags name-only exports for review", () => {
    const preview = parsePowerSchoolRows([
      ["Name", "Course"],
      ["Amor, Konnor", "4(A) Calculus"],
    ]);

    expect(preview.hasStudentNumbers).toBe(false);
    expect(preview.rows[0].identityConfidence).toBe("name-only");
    expect(preview.warnings[0]).toContain("Student Number");
  });

  it("recognizes common Student ID header aliases", () => {
    const preview = parsePowerSchoolRows([
      ["Student", "Student ID", "Class"],
      ["Doe, Jane", 123456, "Period 1"],
    ]);

    expect(preview.rows[0].studentNumber).toBe("123456");
    expect(preview.rows[0].course).toBe("Period 1");
  });

  it("recognizes the PowerSchool roster report Id header", () => {
    const preview = parsePowerSchoolRows([
      ["Name", "Id", "Course"],
      ["Doe, Jane", 456789, "4(A) Calculus / M211"],
    ]);

    expect(preview.hasStudentNumbers).toBe(true);
    expect(preview.rows[0].studentNumber).toBe("456789");
  });

  it("normalizes punctuation and underscores in student-number headers", () => {
    const preview = parsePowerSchoolRows([
      ["Name", "Student_Number", "Course"],
      ["Doe, Jane", 123456, "Period 1"],
    ]);

    expect(preview.rows[0].studentNumber).toBe("123456");
  });

  it("splits Last, First display names for later account matching", () => {
    expect(splitPowerSchoolName("Walter, Matthew")).toEqual({ firstName: "Matthew", lastName: "Walter" });
    expect(splitPowerSchoolName("SingleName")).toEqual({ firstName: null, lastName: null });
  });
});
