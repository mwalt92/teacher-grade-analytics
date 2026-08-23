"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAssignment(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const kind = String(formData.get("kind") ?? "participation");
  const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");
  const assignmentDate = String(formData.get("assignmentDate") ?? "");
  const pointsPossible = Number(formData.get("pointsPossible"));
  if (!sectionId || !title || !gradingPeriodId || !assignmentDate || !Number.isFinite(pointsPossible) || pointsPossible <= 0) {
    throw new Error("Complete all required assignment fields.");
  }
  if (!["participation", "quiz", "test"].includes(kind)) throw new Error("Invalid assignment type.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const [{ data: teacherSection }, { data: period }, { data: categories }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_periods").select("id,section_id").eq("id", gradingPeriodId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_categories").select("id,name").eq("section_id", sectionId),
  ]);
  if (!teacherSection || !period) throw new Error("You do not have access to that section or grading period.");

  const wantedCategory = kind === "participation" ? "participation" : kind === "quiz" ? "quizzes" : "tests";
  const category = categories?.find((item) => item.name.toLowerCase() === wantedCategory);
  if (!category) throw new Error(`The ${wantedCategory} grading category is not configured for this section.`);

  const assignmentId = crypto.randomUUID();
  const { error } = await supabase.from("assignments").insert({
    id: assignmentId,
    section_id: sectionId,
    category_id: category.id,
    grading_period_id: gradingPeriodId,
    title,
    assignment_type: kind,
    assignment_date: assignmentDate,
    points_possible: pointsPossible,
    allow_retakes: kind !== "participation",
    created_by: userId,
  });
  if (error) throw error;

  redirect(`/assignments/${assignmentId}`);
}
