export type CodeOrgResponseRow = {
  rowNumber: number;
  studentName: string;
  lesson: string;
  puzzle: string;
  question: string;
  response: string;
};

export type CodeOrgActivitySummary = {
  key: string;
  lesson: string;
  puzzle: string;
  question: string;
  responseCount: number;
  studentCount: number;
};

export type CodeOrgResponsePreview = {
  fileName: string;
  rows: CodeOrgResponseRow[];
  studentCount: number;
  activities: CodeOrgActivitySummary[];
  warnings: string[];
};

const REQUIRED_HEADERS = ["name", "lesson", "puzzle", "question", "response"] as const;

function normalizeHeader(value: string) {
  return value.replace(/^\uFEFF/, "").trim().toLowerCase().replace(/\s+/g, " ");
}

export function parseCsvMatrix(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];

    if (char === '"') {
      if (inQuotes && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(cell);
      cell = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell);
      cell = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
      continue;
    }

    cell += char;
  }

  if (inQuotes) throw new Error("The CSV contains an unterminated quoted field.");
  row.push(cell);
  if (row.some((value) => value.length > 0)) rows.push(row);
  return rows;
}

export function parseCodeOrgResponsesCsv(text: string, fileName = "responses.csv"): CodeOrgResponsePreview {
  const matrix = parseCsvMatrix(text);
  if (matrix.length < 2) throw new Error("The Code.org export does not contain any response rows.");

  const headers = matrix[0].map(normalizeHeader);
  const indexes = new Map<string, number>();
  headers.forEach((header, index) => indexes.set(header, index));

  for (const required of REQUIRED_HEADERS) {
    if (!indexes.has(required)) throw new Error(`Could not find the ${required} column in the Code.org response export.`);
  }

  const rows: CodeOrgResponseRow[] = [];
  let skipped = 0;

  matrix.slice(1).forEach((raw, index) => {
    const studentName = raw[indexes.get("name")!] ?? "";
    const lesson = raw[indexes.get("lesson")!] ?? "";
    const puzzle = raw[indexes.get("puzzle")!] ?? "";
    const question = raw[indexes.get("question")!] ?? "";
    const response = raw[indexes.get("response")!] ?? "";
    if (!studentName.trim() || !lesson.trim() || !question.trim()) {
      skipped += 1;
      return;
    }
    rows.push({
      rowNumber: index + 2,
      studentName: studentName.trim(),
      lesson: lesson.trim(),
      puzzle: puzzle.trim(),
      question: question.trim(),
      response: response.trim(),
    });
  });

  const activityMap = new Map<string, { lesson: string; puzzle: string; question: string; students: Set<string>; responses: number }>();
  for (const row of rows) {
    const key = `${row.lesson}::${row.puzzle}::${row.question}`;
    const current = activityMap.get(key) ?? {
      lesson: row.lesson,
      puzzle: row.puzzle,
      question: row.question,
      students: new Set<string>(),
      responses: 0,
    };
    current.students.add(row.studentName);
    current.responses += 1;
    activityMap.set(key, current);
  }

  const warnings: string[] = [];
  if (skipped > 0) warnings.push(`${skipped} incomplete row${skipped === 1 ? " was" : "s were"} skipped.`);
  const blankResponses = rows.filter((row) => !row.response).length;
  if (blankResponses > 0) warnings.push(`${blankResponses} submitted row${blankResponses === 1 ? " has" : "s have"} a blank response and should be reviewed separately from missing submissions.`);

  return {
    fileName,
    rows,
    studentCount: new Set(rows.map((row) => row.studentName)).size,
    activities: [...activityMap.entries()].map(([key, value]) => ({
      key,
      lesson: value.lesson,
      puzzle: value.puzzle,
      question: value.question,
      responseCount: value.responses,
      studentCount: value.students.size,
    })).sort((a, b) => a.lesson.localeCompare(b.lesson) || Number(a.puzzle) - Number(b.puzzle) || a.question.localeCompare(b.question)),
    warnings,
  };
}

export function anonymizeCodeOrgRows(rows: CodeOrgResponseRow[]) {
  const aliases = new Map<string, string>();
  return rows.map((row) => {
    let alias = aliases.get(row.studentName);
    if (!alias) {
      alias = `Student ${String(aliases.size + 1).padStart(3, "0")}`;
      aliases.set(row.studentName, alias);
    }
    return { ...row, studentName: alias };
  });
}
