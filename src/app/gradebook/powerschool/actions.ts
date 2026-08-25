"use server";

import { redirect } from "next/navigation";
import { getSectionGradebook } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import { createClient } from "@/lib/supabase/server";

const INPUT_PREFIX = "powerschool:";

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
