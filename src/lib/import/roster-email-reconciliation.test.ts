import { describe, expect, it } from "vitest";
import { parseSchoolEmailList, reconcileRosterEmails } from "./roster-email-reconciliation";

const students = [
  { displayName: "Stone, Riley", studentNumber: "1001", currentEmail: null },
  { displayName: "Harper, Morgan", studentNumber: "1002", currentEmail: "mharper27@students.example.org" },
  { displayName: "De Leon, Casey", studentNumber: "1003", currentEmail: null },
];

describe("roster email reconciliation", () => {
  it("parses semicolon-delimited email lists and normalizes case", () => {
    const parsed = parseSchoolEmailList("RStone27@students.example.org;mharper27@students.example.org");
    expect(parsed.emails).toEqual(["rstone27@students.example.org", "mharper27@students.example.org"]);
    expect(parsed.duplicateEmails).toEqual([]);
    expect(parsed.invalidTokens).toEqual([]);
  });

  it("matches first-initial plus last-name handles while ignoring trailing digits", () => {
    const result = reconcileRosterEmails(students, "rstone27@students.example.org;mharper27@students.example.org;cdeleon27@students.example.org");
    expect(result.unresolvedStudentCount).toBe(0);
    expect(result.unmatchedEmails).toEqual([]);
    expect(result.matches).toEqual([
      { studentNumber: "1001", email: "rstone27@students.example.org", status: "matched" },
      { studentNumber: "1002", email: "mharper27@students.example.org", status: "already-linked" },
      { studentNumber: "1003", email: "cdeleon27@students.example.org", status: "matched" },
    ]);
  });

  it("refuses to auto-resolve duplicate student match keys", () => {
    const duplicateStudents = [
      { displayName: "Stone, Riley", studentNumber: "1001", currentEmail: null },
      { displayName: "Stone, Rowan", studentNumber: "1004", currentEmail: null },
    ];
    const result = reconcileRosterEmails(duplicateStudents, "rstone27@students.example.org;rstone28@students.example.org");
    expect(result.matches.every((match) => match.status === "ambiguous")).toBe(true);
    expect(result.unresolvedStudentCount).toBe(2);
  });

  it("flags duplicate and invalid pasted values", () => {
    const parsed = parseSchoolEmailList("rstone27@students.example.org;RSTONE27@students.example.org;not-an-email");
    expect(parsed.duplicateEmails).toEqual(["rstone27@students.example.org"]);
    expect(parsed.invalidTokens).toEqual(["not-an-email"]);
  });
});
