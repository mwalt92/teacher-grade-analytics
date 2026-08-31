"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type AssignmentScope = "current" | "linked";

function safeReturnPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/assignments";
  if (path.startsWith("//")) return "/assignments";
  if (path === "/assignments" || path.startsWith("/assignments?") || path.startsWith("/gradebook/assignments")) return path;
  return "/assignments";
}

function assignmentScope(value: FormDataEntryValue | null): AssignmentScope {
  return value === "linked" ? "linked" : "current";
}

function withQuery(path: string, key: string, value: string) {
  const url = new URL(path, "https://teacher-grade-analytics.local");
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function withQueries(path: string, values: Record<string, string>) {
  const url = new URL(path, "https://teacher-grade-analytics.local");
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function editRedirect(assignmentId: string, returnTo: string, key: string, value: string) {
  const url = new URL(`/assignments/${assignmentId}/edit`, "https://teacher-grade-analytics.local");
  url.searchParams.set("returnTo", returnTo);
  url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function editRedirectWithQueries(assignmentId: string, returnTo: string, values: Record<string, string>) {
  const url = new URL(`/assignments/${assignmentId}/edit`, "https://teacher-grade-analytics.local");
  url.searchParams.set("returnTo", returnTo);
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

async function requireTeacherAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_type,title,link_group_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) throw new Error("Assignment not found.");

  const [{ data: teacherSection, error: teacherError }, { data: section, error: sectionError }] = await Promise.all([
    supabase
      .from("teacher_sections")
      .select("section_id")
      .eq("teacher_id", userId)
      .eq("section_id", assignment.section_id)
      .maybeSingle(),
    supabase
      .from("sections")
      .select("offering_id")
      .eq("id", assignment.section_id)
      .maybeSingle(),
  ]);
  if (teacherError || !teacherSection) throw new Error("You do not have access to this assignment.");
  if (sectionError || !section?.offering_id) throw new Error("This section is missing its course offering.");

  return { supabase, assignment, userId, offeringId: section.offering_id };
}

async function getTargetAssignments(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assignment: { id: string; section_id: string; title: string; link_group_id: string | null },
  scope: AssignmentScope,
) {
  if (scope !== "linked" || !assignment.link_group_id) {
    return [{ id: assignment.id, section_id: assignment.section_id, title: assignment.title }];
  }

  const { data, error } = await supabase
    .from("assignments")
    .select("id,section_id,title")
    .eq("link_group_id", assignment.link_group_id)
    .order("created_at");
  if (error || !data?.length) throw new Error("Could not load the linked assignment group.");
  return data;
}

function revalidateAssignmentViews(assignmentIds: string[]) {
  revalidatePath("/");
  revalidatePath("/assignments");
  for (const assignmentId of assignmentIds) {
    revalidatePath(`/assignments/${assignmentId}`);
    revalidatePath(`/assignments/${assignmentId}/edit`);
  }
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
  const scope = assignmentScope(formData.get("scope"));
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

  const { supabase, assignment, offeringId } = await requireTeacherAssignment(assignmentId);
  const [{ data: period }, { data: assignmentType }, { data: category }] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("id")
      .eq("id", gradingPeriodId)
      .eq("offering_id", offeringId)
      .maybeSingle(),
    supabase
      .from("assignment_types")
      .select("id,code")
      .eq("id", assignmentTypeId)
      .eq("offering_id", offeringId)
      .maybeSingle(),
    supabase
      .from("grading_categories")
      .select("id")
      .eq("id", categoryId)
      .eq("offering_id", offeringId)
      .maybeSingle(),
  ]);
  if (!period) redirect(editRedirect(assignmentId, returnTo, "error", "Choose a grading period from this course."));
  if (!assignmentType) redirect(editRedirect(assignmentId, returnTo, "error", "Choose an assignment type from this course."));
  if (!category) redirect(editRedirect(assignmentId, returnTo, "error", "Choose a grading category from this course."));

  const targets = await getTargetAssignments(supabase, assignment, scope);
  const targetIds = targets.map((item) => item.id);
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
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
      updated_at: now,
    })
    .in("id", targetIds)
    .select("id");

  if (error || !updated?.length) redirect(editRedirect(assignmentId, returnTo, "error", "Could not save the assignment changes."));
  revalidateAssignmentViews(updated.map((item) => item.id));
  redirect(editRedirectWithQueries(assignmentId, returnTo, { saved: scope, count: String(updated.length) }));
}

export async function archiveAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const scope = assignmentScope(formData.get("scope"));
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  const targets = await getTargetAssignments(supabase, assignment, scope);
  const targetIds = targets.map((item) => item.id);
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("assignments")
    .update({ archived: true, archived_at: now, updated_at: now })
    .in("id", targetIds)
    .select("id");
  if (error || !updated?.length) redirect(withQuery(returnTo, "error", "Could not archive that assignment."));
  revalidateAssignmentViews(updated.map((item) => item.id));
  redirect(withQueries(returnTo, { notice: "archived", scope, count: String(updated.length) }));
}

export async function restoreAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const scope = assignmentScope(formData.get("scope"));
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  const targets = await getTargetAssignments(supabase, assignment, scope);
  const targetIds = targets.map((item) => item.id);
  const now = new Date().toISOString();
  const { data: updated, error } = await supabase
    .from("assignments")
    .update({ archived: false, archived_at: null, updated_at: now })
    .in("id", targetIds)
    .select("id");
  if (error || !updated?.length) redirect(withQuery(returnTo, "error", "Could not restore that assignment."));
  revalidateAssignmentViews(updated.map((item) => item.id));
  redirect(withQueries(returnTo, { notice: "restored", scope, count: String(updated.length) }));
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

  revalidateAssignmentViews([assignmentId]);
  redirect(editRedirect(assignmentId, returnTo, "cleared", String(Number(cleared ?? 0))));
}

export async function deleteEmptyAssignment(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const scope = assignmentScope(formData.get("scope"));
  const confirmTitle = String(formData.get("confirmTitle") ?? "").trim();
  if (!assignmentId) redirect("/assignments");
  const { supabase, assignment } = await requireTeacherAssignment(assignmentId);
  if (confirmTitle !== assignment.title) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Type the exact assignment title before permanently deleting it."));
  }

  const targets = await getTargetAssignments(supabase, assignment, scope);
  const targetIds = targets.map((item) => item.id);
  const { count: gradeRecordCount, error: gradeRecordError } = await supabase
    .from("grade_records")
    .select("id", { count: "exact", head: true })
    .in("assignment_id", targetIds);
  if (gradeRecordError || (gradeRecordCount ?? 0) > 0) {
    redirect(editRedirect(assignmentId, returnTo, "error", scope === "linked"
      ? "Every linked section assignment must be empty before deleting the group. Clear scores section by section first."
      : "Only an assignment with no student grade records can be permanently deleted."));
  }

  const { data: deleted, error } = await supabase
    .from("assignments")
    .delete()
    .in("id", targetIds)
    .select("id");
  if (error || !deleted?.length) {
    redirect(editRedirect(assignmentId, returnTo, "error", "Could not permanently delete the selected assignment scope."));
  }
  revalidateAssignmentViews(deleted.map((item) => item.id));
  redirect(withQueries(returnTo, { notice: "deleted", scope, count: String(deleted.length) }));
}
