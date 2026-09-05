import { describe, expect, it } from "vitest";
import { anonymizeCodeOrgRows, parseCodeOrgResponsesCsv, parseCsvMatrix } from "./codeorg-responses";

describe("Code.org response CSV parser", () => {
  it("preserves quoted commas and newlines inside a response", () => {
    const rows = parseCsvMatrix('Name,Lesson,Puzzle,Question,Response\r\n"Student A","Lesson 1","6","What changed?","It got more specific, useful, and\nclear."');
    expect(rows[1][4]).toBe("It got more specific, useful, and\nclear.");
  });

  it("parses the Code.org export shape and groups activities", () => {
    const preview = parseCodeOrgResponsesCsv([
      "Name,Lesson,Puzzle,Question,Response",
      '"Student A","Lesson 1: Talking to Machines","6","How did it change?","More specific"',
      '"Student B","Lesson 1: Talking to Machines","6","How did it change?","More useful"',
      '"Student A","Lesson 5: Uncovering Contradictions","7","Do humans contradict?","Sometimes"',
    ].join("\n"), "responses.csv");

    expect(preview.rows).toHaveLength(3);
    expect(preview.studentCount).toBe(2);
    expect(preview.activities).toHaveLength(2);
  });

  it("anonymizes names deterministically without changing response content", () => {
    const preview = parseCodeOrgResponsesCsv([
      "Name,Lesson,Puzzle,Question,Response",
      '"Student A","Lesson 1","6","Q","First"',
      '"Student B","Lesson 1","6","Q","Second"',
      '"Student A","Lesson 5","7","Q2","Third"',
    ].join("\n"));
    const rows = anonymizeCodeOrgRows(preview.rows);
    expect(rows.map((row) => row.studentName)).toEqual(["Student 001", "Student 002", "Student 001"]);
    expect(rows[2].response).toBe("Third");
  });
});
