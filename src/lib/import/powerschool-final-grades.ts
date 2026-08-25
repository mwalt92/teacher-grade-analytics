import ExcelJS from "exceljs";

export type PowerSchoolFinalGradeRow = {
  termCode: string;
  studentName: string;
  percent: number;
};

export type PowerSchoolFinalGradesReport = {
  rows: PowerSchoolFinalGradeRow[];
  sheetName: string;
  skippedRows: number;
};

function cellText(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value).trim();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "object") {
    const candidate = value as { text?: unknown; result?: unknown; richText?: Array<{ text?: unknown }> };
    if (candidate.text !== undefined) return cellText(candidate.text);
    if (candidate.result !== undefined) return cellText(candidate.result);
    if (Array.isArray(candidate.richText)) return candidate.richText.map((part) => cellText(part.text)).join("").trim();
  }
  return String(value).trim();
}

function headerKey(value: unknown) {
  return cellText(value).toLowerCase().replace(/[^a-z0-9]/g, "");
}

function parsePercent(value: unknown): number | null {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return null;
    return value >= 0 && value <= 2 ? value * 100 : value;
  }
  const text = cellText(value);
  if (!text) return null;
  const containsPercent = text.includes("%");
  const numeric = Number(text.replace(/[%,$]/g, "").trim());
  if (!Number.isFinite(numeric)) return null;
  return !containsPercent && numeric >= 0 && numeric <= 2 ? numeric * 100 : numeric;
}

export function studentNameKeys(value: string): string[] {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9,\s'-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!normalized) return [];

  const tokenKey = (input: string) => input.split(/[^a-z0-9]+/).filter(Boolean).sort().join("|");
  const keys = new Set<string>([tokenKey(normalized)]);
  if (normalized.includes(",")) {
    const [last, ...rest] = normalized.split(",").map((part) => part.trim()).filter(Boolean);
    if (last && rest.length) keys.add(tokenKey(`${rest.join(" ")} ${last}`));
  }
  return [...keys].filter(Boolean);
}

export async function parsePowerSchoolFinalGradesReport(buffer: Buffer): Promise<PowerSchoolFinalGradesReport> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const worksheet = workbook.worksheets[0];
  if (!worksheet) throw new Error("The PowerSchool workbook does not contain a worksheet.");

  const headerRow = worksheet.getRow(1);
  const columns = new Map<string, number>();
  headerRow.eachCell((cell, columnNumber) => columns.set(headerKey(cell.value), columnNumber));

  const reportingTermColumn = columns.get("reportingterm");
  const studentNameColumn = columns.get("studentname");
  const percentColumn = columns.get("percent");
  if (!reportingTermColumn || !studentNameColumn || !percentColumn) {
    throw new Error("This does not look like a PowerSchool Final Grades report. Expected Reporting Term, Student Name, and Percent columns.");
  }

  const rows: PowerSchoolFinalGradeRow[] = [];
  let currentTerm = "";
  let skippedRows = 0;

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const term = cellText(row.getCell(reportingTermColumn).value).toUpperCase();
    if (term) currentTerm = term;

    const studentName = cellText(row.getCell(studentNameColumn).value);
    const percent = parsePercent(row.getCell(percentColumn).value);
    if (!studentName && !currentTerm && percent === null) continue;
    if (!studentName || !currentTerm || percent === null) {
      skippedRows += 1;
      continue;
    }
    rows.push({ termCode: currentTerm, studentName, percent });
  }

  if (rows.length === 0) throw new Error("No student final-grade rows were found in the PowerSchool report.");
  return { rows, sheetName: worksheet.name, skippedRows };
}
