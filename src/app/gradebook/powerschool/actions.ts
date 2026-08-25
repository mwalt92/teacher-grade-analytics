"use server";

import { redirect } from "next/navigation";
import { getSectionGradebook } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { parsePowerSchoolFinalGradesReport, studentNameKeys } from "@/lib/import/powerschool-final-grades";
import { createClient } from "@/lib/supabase/server";

const INPUT_PREFIX = "powerschool:";
const PERIOD_ORDER = ["Q1", "Q2", "S1", "Q3", "Q4", "S2"];

export async function savePowerSchoolSnapshot(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const periodCode = String(formData.get("period") ?? "");
  if (!sectionId || !/^(Q[1-4]|S[12])$/.test(periodCode)) {
    throw new Error("Choose a valid section and grading period.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const [{ data: teacherSection }, { data: period }, roster] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_periods").select("id,code").eq("section_id", sectionId).eq("code", periodCode).maybeSingle(),
    getSectionRoster(sectionId, "active"),
  ]);
  if (!teacherSection || !period) throw new Error("You do not have access to that section or grading period.");

  const rosterIds = new Set(roster.map((student) => student.studentId));
  const submitted = new Map<string, number>();
  for (const [key, rawValue] of formData.entries()) {
    if (!key.startsWith(INPUT_PREFIX)) continue;
    const studentId = key.slice(INPUT_PREFIX.length);
    const text = String(rawValue).trim();
    if (!text || !rosterIds.has(studentId)) continue;
    const percent = Number(text);
    if (!Number.isFinite(percent) || percent < 0 || percent > 200) {
      throw new Error("PowerSchool grades must be numbers between 0 and 200.");
    }
    submitted.set(studentId, percent);
  }

  if (submitted.size === 0) redirect(`/gradebook/powerschool?period=${encodeURIComponent(periodCode)}`);

  const calculation = await getSectionGradebook(sectionId, roster.map((student) => student.studentId), periodCode);
  if (!calculation) throw new Error("The website grades could not be calculated for this grading period.");
  const websiteByStudent = new Map(calculation.rows.map((row) => [row.studentId, row.overallPercent]));

  const rows = [...submitted.entries()].flatMap(([studentId, powerSchoolPercent]) => {
    const websitePercent = websiteByStudent.get(studentId);
    if (websitePercent === null || websitePercent === undefined) return [];
    return [{
      student_id: studentId,
      section_id: sectionId,
      grading_period_id: period.id,
      powerschool_percent: powerSchoolPercent,
      website_percent: websitePercent,
      note: "Manual class comparison entry",
    }];
  });

  if (rows.length === 0) throw new Error("None of the entered students currently have a website grade to compare.");
  const { error } = await supabase.from("power_school_snapshots").insert(rows);
  if (error) throw error;

  redirect(`/gradebook/powerschool?period=${encodeURIComponent(periodCode)}&saved=${rows.length}`);
}

export async function importPowerSchoolFinalGrades(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const upload = formData.get("report");
  if (!sectionId || !(upload instanceof File) || upload.size === 0) throw new Error("Choose a PowerSchool Final Grades .xlsx report.");
  if (!upload.name.toLowerCase().endsWith(".xlsx")) throw new Error("The PowerSchool importer currently accepts .xlsx Final Grades reports.");
  if (upload.size > 10 * 1024 * 1024) throw new Error("The PowerSchool report is unexpectedly large. Please use a report under 10 MB.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const [{ data: teacherSection }, { data: periods }, roster] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_periods").select("id,code").eq("section_id", sectionId),
    getSectionRoster(sectionId, "active"),
  ]);
  if (!teacherSection || !periods) throw new Error("You do not have access to that section.");

  const report = await parsePowerSchoolFinalGradesReport(Buffer.from(await upload.arrayBuffer()));
  const periodByCode = new Map(periods.filter((period) => /^(Q[1-4]|S[12])$/.test(period.code)).map((period) => [period.code, period]));

  const rosterByNameKey = new Map<string, Set<string>>();
  for (const student of roster) {
    for (const key of studentNameKeys(student.displayName)) {
      const matches = rosterByNameKey.get(key) ?? new Set<string>();
      matches.add(student.studentId);
      rosterByNameKey.set(key, matches);
    }
  }

  const matched = new Map<string, { studentId: string; termCode: string; powerSchoolPercent: number }>();
  let unmatchedRows = 0;
  let ignoredTermRows = 0;

  for (const row of report.rows) {
    const period = periodByCode.get(row.termCode);
    if (!period) {
      ignoredTermRows += 1;
      continue;
    }
    const candidates = new Set<string>();
    for (const key of studentNameKeys(row.studentName)) {
      for (const studentId of rosterByNameKey.get(key) ?? []) candidates.add(studentId);
    }
    if (candidates.size !== 1) {
      unmatchedRows += 1;
      continue;
    }
    const studentId = [...candidates][0];
    matched.set(`${row.termCode}:${studentId}`, { studentId, termCode: row.termCode, powerSchoolPercent: row.percent });
  }

  if (matched.size === 0) throw new Error("No report rows could be matched to the active roster and grading periods for this section.");

  const studentIds = roster.map((student) => student.studentId);
  const importedTerms = [...new Set([...matched.values()].map((entry) => entry.termCode))]
    .sort((a, b) => PERIOD_ORDER.indexOf(a) - PERIOD_ORDER.indexOf(b));
  const calculations = await Promise.all(importedTerms.map(async (termCode) => [termCode, await getSectionGradebook(sectionId, studentIds, termCode)] as const));
  const calculationByTerm = new Map(calculations);

  let noWebsiteGradeRows = 0;
  const snapshots = [...matched.values()].flatMap((entry) => {
    const calculation = calculationByTerm.get(entry.termCode);
    const websitePercent = calculation?.rows.find((row) => row.studentId === entry.studentId)?.overallPercent ?? null;
    const period = periodByCode.get(entry.termCode);
    if (!period || websitePercent === null) {
      noWebsiteGradeRows += 1;
      return [];
    }
    return [{
      student_id: entry.studentId,
      section_id: sectionId,
      grading_period_id: period.id,
      powerschool_percent: entry.powerSchoolPercent,
      website_percent: websitePercent,
      note: `PowerSchool Final Grades import: ${upload.name}`,
    }];
  });

  if (snapshots.length === 0) throw new Error("The report matched the roster, but none of those students currently have website grades to compare.");
  const { error } = await supabase.from("power_school_snapshots").insert(snapshots);
  if (error) throw error;

  const preferredPeriod = importedTerms.includes("Q1") ? "Q1" : importedTerms[0];
  const params = new URLSearchParams({
    period: preferredPeriod,
    imported: String(snapshots.length),
    unmatched: String(unmatchedRows),
    skipped: String(report.skippedRows + ignoredTermRows + noWebsiteGradeRows),
    terms: importedTerms.join(","),
  });
  redirect(`/gradebook/powerschool?${params.toString()}`);
}
