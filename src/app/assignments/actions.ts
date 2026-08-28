"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAssignment(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const assignmentTypeId = String(formData.get("assignmentTypeId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");
  const assignmentDate = String(formData.get("assignmentDate") ?? "");
  const pointsPossible = Number(formData.get("pointsPossible"));
  const allowRetakes = String(formData.get("allowRetakes") ?? "") === "true";
  if (!sectionId || !title || !assignmentTypeId || !categoryId || !gradingPeriodId || !assignmentDate || !Number.isFinite(pointsPossible) || pointsPossible <= 0) {
    throw new Error("Complete all required assignment fields.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const [{ data: teacherSection }, { data: period }, { data: assignmentType }, { data: category }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_periods").select("id").eq("id", gradingPeriodId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("assignment_types").select("id,code,active").eq("id", assignmentTypeId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("grading_categories").select("id").eq("id", categoryId).eq("section_id", sectionId).maybeSingle(),
  ]);
  if (!teacherSection || !period) throw new Error("You do not have access to that section or grading period.");
  if (!assignmentType || !assignmentType.active) throw new Error("Choose an active assignment type from this section.");
  if (!category) throw new Error("Choose a grading category from this section.");

  const assignmentId = crypto.randomUUID();
  const { error } = await supabase.from("assignments").insert({
    id: assignmentId,
    section_id: sectionId,
    assignment_type_id: assignmentType.id,
    category_id: category.id,
    grading_period_id: gradingPeriodId,
    title,
    assignment_type: assignmentType.code,
    assignment_date: assignmentDate,
    points_possible: pointsPossible,
    allow_retakes: allowRetakes,
    created_by: userId,
  });
  if (error) throw error;

  redirect(`/assignments/${assignmentId}`);
}
