"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function safeReturnPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/assignments";
  if (path.startsWith("//")) return "/assignments";
  if (path === "/assignments" || path.startsWith("/assignments?") || path.startsWith("/gradebook/assignments")) return path;
  return "/assignments";
}

function withQuery(path: string, key: string, value: string) {
  const url = new URL(path, "https://teacher-grade-analytics.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function editRedirect(assignmentId: string, returnTo: string, key: string, value: string) {
  const url = new URL(`/assignments/${assignmentId}/edit`, "https://teacher-grade-analytics.local");
  url.searchParams.set("returnTo", returnTo);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

async function requireTeacherAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_type,title")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) throw new Error("Assignment not found.");

  const { data: teacherSection, error: teacherError } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", userId)
    .eq("section_id", assignment.section_id)
    .maybeSingle();
  if (teacherError || !teacherSection) throw new Error("You do not have access to this assignment.");

  return { supabase, assignment, userId };
}

function revalidateAssignmentViews(assignmentId: string) {
  revalidatePath("/");
  revalidatePath("/assignments");
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath(`/assignments/${assignmentId}/edit`);
  revalidatePath("/gradebook");
  revalidatePath("/gradebook/assignments");
  revalidatePath("/gradebook/audit");
  revalidatePath("/gradebook/powerschool");
  revalidatePath("/student");
  revalidatePath("/student/preview");
}

export async function updateAssignmentMetadata(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const title = String(formData.get("title") ?? "").trim();
  const assignmentDate = String(formData.get("assignmentDate") ?? "");
  const gradingPeriodId = String(formData.get("gradingPeriodId") ?? "");
  const assignmentTypeId = String(formData.get("assignmentTypeId") ?? "");
  const categoryId = String(formData.get("categoryId") ?? "");
  const pointsPossible = Number(formData.get("pointsPossible"));
  const allowRetakes = String(formData.get("allowRetakes") ?? "") === "true";

  if (!assignmentId) redirect("/assignments");
  if (!title || !assignmentDate || !gradingPeriodId || !assignmentTypeId || !categoryId || !Number.isFinite(pointsPossible) || pointsPossible <= 0) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Complete all required assignment fields."));
  }

  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  const [{ data: period }, { data: assignmentType }, { data: category }] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("id")
      .eq("id", gradingPeriodId)
      .eq("section_id", assignment.section_id)
      .maybeSingle(),
    supabase
      .from("assignment_types")
      .select("id,code")
      .eq("id", assignmentTypeId)
      .eq("section_id", assignment.section_id)
      .maybeSingle(),
    supabase
      .from("grading_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("section_id", assignment.section_id)
      .maybeSingle(),
  ]);
  if (!period) redirect(editRedirect(assignmentId, returnTo, "error", "Choose a grading period from this section."));
  if (!assignmentType) redirect(editRedirect(assignmentId, returnTo, "error", "Choose an assignment type from this section."));
  if (!category) redirect(editRedirect(assignmentId, returnTo, "error", "Choose a grading category from this section."));

  const { error } = await supabase
    .from("assignments")
    .update({
      title,
      assignment_type_id: assignmentType.id,
      assignment_type: assignmentType.code,
      assignment_date: assignmentDate,
      grading_period_id: gradingPeriodId,
      category_id: category.id,
      points_possible: pointsPossible,
      allow_retakes: allowRetakes,
      updated_at: new Date().toISOString(),
    })
    .eq("id", assignmentId)
    .eq("section_id", assignment.section_id);

  if (error) redirect(editRedirect(assignmentId, returnTo, "error", "Could not save the assignment changes."));
  revalidateAssignmentViews(assignmentId);
  redirect(editRedirect(assignmentId, returnTo, "saved", "1"));
}

export async function archiveAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  const { error } = await supabase
    .from("assignments")
    .update({ archived: true, archived_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("section_id", assignment.section_id);
  if (error) redirect(withQuery(returnTo, "error", "Could not archive that assignment."));
  revalidateAssignmentViews(assignmentId);
  redirect(withQuery(returnTo, "notice", "archived"));
}

export async function restoreAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  const { error } = await supabase
    .from("assignments")
    .update({ archived: false, archived_at: null, updated_at: new Date().toISOString() })
    .eq("id", assignmentId)
    .eq("section_id", assignment.section_id);
  if (error) redirect(withQuery(returnTo, "error", "Could not restore that assignment."));
  revalidateAssignmentViews(assignmentId);
  redirect(withQuery(returnTo, "notice", "restored"));
}

export async function clearAssignmentScores(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  if (!assignmentId) redirect("/assignments");

  const { supabase } = await requireTeacherAssignment(assignmentId);
  const { data: cleared, error } = await supabase.rpc("clear_assignment_scores", { p_assignment_id: assignmentId });
  if (error) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Could not clear this assignment's scores."));
  }

  revalidateAssignmentViews(assignmentId);
  redirect(editRedirect(assignmentId, returnTo, "cleared", String(Number(cleared ?? 0))));
}

export async function deleteEmptyAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const confirmTitle = String(formData.get("confirmTitle") ?? "").trim();
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  if (confirmTitle !== assignment.title) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Type the exact assignment title before permanently deleting it."));
  }
  const { data: deleted, error } = await supabase.rpc("delete_empty_assignment", { p_assignment_id: assignmentId });
  if (error || !deleted) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Only an assignment with no student grade records can be permanently deleted."));
  }
  revalidateAssignmentViews(assignmentId);
  redirect(withQuery(returnTo, "notice", "deleted"));
}
