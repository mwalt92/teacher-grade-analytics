import ExcelJS from "exceljs";

export type ParsedRosterRow = {
  rowNumber: number;
  displayName: string;
  firstName: string | null;
  lastName: string | null;
  studentNumber: string | null;
  schoolEmail: string | null;
  course: string;
  identityConfidence: "strong" | "name-only";
};

export type RosterCourseGroup = {
  course: string;
  rows: ParsedRosterRow[];
};

export type RosterPreview = {
  fileName: string;
  rows: ParsedRosterRow[];
  courseGroups: RosterCourseGroup[];
  warnings: string[];
  skippedRows: number;
  hasStudentNumbers: boolean;
};

const HEADER_ALIASES = {
  name: ["name", "student name", "student"],
  course: ["course", "class", "course name", "section"],
  studentNumber: ["id", "student number", "student id", "studentid", "student #", "student no", "local id", "local student id"],
  email: ["email", "school email", "student email"],
} as const;

function normalized(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[_\-./#]+/g, " ")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function headerIndex(headers: unknown[], aliases: readonly string[]) {
  const normalizedHeaders = headers.map(normalized);
  const normalizedAliases = aliases.map(normalized);
  return normalizedHeaders.findIndex((header) => normalizedAliases.includes(header));
}

export function splitPowerSchoolName(displayName: string) {
  const trimmed = displayName.trim();
  if (!trimmed.includes(",")) return { firstName: null, lastName: null };
  const [last, ...firstParts] = trimmed.split(",");
  const first = firstParts.join(",").trim();
  return {
    firstName: first || null,
    lastName: last.trim() || null,
  };
}

export function parsePowerSchoolRows(rawRows: unknown[][], fileName = "roster.xlsx"): RosterPreview {
  if (rawRows.length < 2) throw new Error("The roster file does not contain any student rows.");

  const headers = rawRows[0];
  const nameIndex = headerIndex(headers, HEADER_ALIASES.name);
  const courseIndex = headerIndex(headers, HEADER_ALIASES.course);
  const studentNumberIndex = headerIndex(headers, HEADER_ALIASES.studentNumber);
  const emailIndex = headerIndex(headers, HEADER_ALIASES.email);

  if (nameIndex < 0) throw new Error("Could not find a Name column in the PowerSchool roster.");
  if (courseIndex < 0) throw new Error("Could not find a Course column in the PowerSchool roster.");

  const rows: ParsedRosterRow[] = [];
  let skippedRows = 0;

  rawRows.slice(1).forEach((raw, index) => {
    const displayName = String(raw[nameIndex] ?? "").trim();
    const course = String(raw[courseIndex] ?? "").trim();
    if (!displayName || !course) {
      skippedRows += 1;
      return;
    }

    const studentNumber = studentNumberIndex >= 0 ? String(raw[studentNumberIndex] ?? "").trim() || null : null;
    const schoolEmail = emailIndex >= 0 ? String(raw[emailIndex] ?? "").trim().toLowerCase() || null : null;
    const { firstName, lastName } = splitPowerSchoolName(displayName);

    rows.push({
      rowNumber: index + 2,
      displayName,
      firstName,
      lastName,
      studentNumber,
      schoolEmail,
      course,
      identityConfidence: studentNumber ? "strong" : "name-only",
    });
  });

  const byCourse = new Map<string, ParsedRosterRow[]>();
  for (const row of rows) {
    const list = byCourse.get(row.course) ?? [];
    list.push(row);
    byCourse.set(row.course, list);
  }

  const warnings: string[] = [];
  const hasStudentNumbers = rows.length > 0 && rows.every((row) => Boolean(row.studentNumber));
  if (!hasStudentNumbers) {
    warnings.push("Student Number is missing for at least one row. Name-only matching requires review before import.");
  }
  if (skippedRows > 0) warnings.push(`${skippedRows} blank or incomplete row${skippedRows === 1 ? " was" : "s were"} skipped.`);

  return {
    fileName,
    rows,
    courseGroups: [...byCourse.entries()]
      .map(([course, courseRows]) => ({ course, rows: courseRows }))
      .sort((a, b) => a.course.localeCompare(b.course)),
    warnings,
    skippedRows,
    hasStudentNumbers,
  };
}

function cellValue(value: ExcelJS.CellValue): unknown {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text;
    if ("result" in value) return value.result ?? "";
    if ("richText" in value && Array.isArray(value.richText)) return value.richText.map((part) => part.text).join("");
  }
  return value;
}

export async function parsePowerSchoolWorkbook(file: File): Promise<RosterPreview> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (extension !== "xlsx") throw new Error("Please upload a PowerSchool .xlsx roster export.");
  if (file.size > 5 * 1024 * 1024) throw new Error("Roster files must be 5 MB or smaller.");

  const workbook = new ExcelJS.Workbook();
  const excelBuffer = Buffer.from(await file.arrayBuffer()) as unknown as Parameters<typeof workbook.xlsx.load>[0];
  await workbook.xlsx.load(excelBuffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The workbook does not contain a worksheet.");

  const rawRows: unknown[][] = [];
  worksheet.eachRow({ includeEmpty: false }, (row) => {
    rawRows.push((row.values as ExcelJS.CellValue[]).slice(1).map(cellValue));
  });

  return parsePowerSchoolRows(rawRows, file.name);
}
