"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function createAssignment(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const sectionIds = [...new Set(formData.getAll("sectionIds").map((value) => String(value)).filter(Boolean))];
  const title = String(formData.get("title") ?? "").trim();
  const assignmentTypeId = String(formData.get("assignmentTypeId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");
  const assignmentDate = String(formData.get("assignmentDate") ?? "");
  const pointsPossible = Number(formData.get("pointsPossible"));
  const allowRetakes = String(formData.get("allowRetakes") ?? "") === "true";
  if (!sectionId || sectionIds.length === 0 || !title || !assignmentTypeId || !categoryId || !gradingPeriodId || !assignmentDate || !Number.isFinite(pointsPossible) || pointsPossible <= 0) {
    throw new Error("Complete all required assignment fields and choose at least one section.");
  }

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: created, error } = await supabase.rpc("create_linked_assignments", {
    p_anchor_section_id: sectionId,
    p_section_ids: sectionIds,
    p_assignment_type_id: assignmentTypeId,
    p_category_id: categoryId,
    p_grading_period_id: gradingPeriodId,
    p_title: title,
    p_assignment_date: assignmentDate,
    p_points_possible: pointsPossible,
    p_allow_retakes: allowRetakes,
  });
  if (error) throw error;
  if (!created?.length) throw new Error("The assignment could not be created.");

  const destination = created.find((row) => row.section_id === sectionId) ?? created[0];
  redirect(`/assignments/${destination.assignment_id}?published=${created.length}`);
}
