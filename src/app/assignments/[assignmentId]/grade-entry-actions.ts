"use server";

import { createClient } from "@/lib/supabase/server";

type SaveGradeEntryInput = {
  assignmentId: string;
  studentId: string;
  points: number;
  missing: boolean;
};

type ClearGradeEntryInput = {
  assignmentId: string;
  studentId: string;
};

export type SaveGradeEntryResult =
  | { ok: true; savedAt: string; points: number; missing: boolean }
  | { ok: false; error: string };

export type ClearGradeEntryResult =
  | { ok: true; savedAt: string }
  | { ok: false; error: string };

async function getAuthorizedContext(assignmentId: string, studentId: string) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return { ok: false as const, error: "Your session expired. Sign in again." };

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_date")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false as const, error: "Assignment not found." };

  const [{ data: teacherSection }, { data: enrollment }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("enrollments").select("id").eq("section_id", assignment.section_id).eq("student_id", studentId).eq("active", true).maybeSingle(),
  ]);
  if (!teacherSection || !enrollment) return { ok: false as const, error: "You do not have access to enter this grade." };

  return { ok: true as const, supabase, userId, assignment };
}

export async function saveGradeEntry(input: SaveGradeEntryInput): Promise<SaveGradeEntryResult> {
  const { assignmentId, studentId, missing } = input;
  const points = missing ? 0 : Number(input.points);

  if (!assignmentId || !studentId || !Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Enter a valid non-negative score." };
  }

  const context = await getAuthorizedContext(assignmentId, studentId);
  if (!context.ok) return context;
  const { supabase, userId, assignment } = context;

  const { data: existingRecord } = await supabase
    .from("grade_records")
    .select("id,missing,exempt")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();

  let recordId = existingRecord?.id;
  if (!recordId) {
    const { data: created, error } = await supabase
      .from("grade_records")
      .insert({ assignment_id: assignmentId, student_id: studentId, missing, exempt: false })
      .select("id")
      .single();
    if (error || !created) return { ok: false, error: error?.message ?? "Could not create grade record." };
    recordId = created.id;
  } else {
    const { error } = await supabase.from("grade_records").update({ missing, exempt: false }).eq("id", recordId);
    if (error) return { ok: false, error: error.message };
  }

  const { data: existingAttempt } = await supabase
    .from("grade_attempts")
    .select("id,points_earned,is_late,occurred_on")
    .eq("grade_record_id", recordId)
    .eq("attempt_number", 1)
    .maybeSingle();

  if (existingAttempt) {
    const { error } = await supabase
      .from("grade_attempts")
      .update({ points_earned: points, entered_by: userId })
      .eq("id", existingAttempt.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("grade_attempts").insert({
      grade_record_id: recordId,
      attempt_number: 1,
      points_earned: points,
      occurred_on: assignment.assignment_date,
      is_late: false,
      entered_by: userId,
    });
    if (error) return { ok: false, error: error.message };
  }

  const oldValue = existingRecord || existingAttempt
    ? { missing: existingRecord?.missing ?? false, points: existingAttempt ? Number(existingAttempt.points_earned) : null }
    : null;
  const newValue = { missing, points };
  const { error: auditError } = await supabase.from("grade_changes").insert({
    grade_record_id: recordId,
    changed_by: userId,
    old_value: oldValue,
    new_value: newValue,
    action: existingRecord || existingAttempt ? "grade_entry_updated" : "grade_entry_created",
  });
  if (auditError) return { ok: false, error: `Grade saved, but audit logging failed: ${auditError.message}` };

  return { ok: true, savedAt: new Date().toISOString(), points, missing };
}

export async function clearGradeEntry(input: ClearGradeEntryInput): Promise<ClearGradeEntryResult> {
  const { assignmentId, studentId } = input;
  if (!assignmentId || !studentId) return { ok: false, error: "Could not identify the grade entry to clear." };

  const context = await getAuthorizedContext(assignmentId, studentId);
  if (!context.ok) return context;
  const { supabase, userId } = context;

  const { data: record } = await supabase
    .from("grade_records")
    .select("id,missing,exempt")
    .eq("assignment_id", assignmentId)
    .eq("student_id", studentId)
    .maybeSingle();
  if (!record) return { ok: true, savedAt: new Date().toISOString() };

  const { data: attempt } = await supabase
    .from("grade_attempts")
    .select("id,points_earned")
    .eq("grade_record_id", record.id)
    .eq("attempt_number", 1)
    .maybeSingle();

  if (attempt) {
    const { error: deleteError } = await supabase.from("grade_attempts").delete().eq("id", attempt.id);
    if (deleteError) return { ok: false, error: deleteError.message };
  }

  const { error: recordError } = await supabase.from("grade_records").update({ missing: false, exempt: false }).eq("id", record.id);
  if (recordError) return { ok: false, error: recordError.message };

  const { error: auditError } = await supabase.from("grade_changes").insert({
    grade_record_id: record.id,
    changed_by: userId,
    old_value: { missing: record.missing, points: attempt ? Number(attempt.points_earned) : null },
    new_value: { missing: false, points: null },
    action: "grade_entry_cleared",
  });
  if (auditError) return { ok: false, error: `Grade cleared, but audit logging failed: ${auditError.message}` };

  return { ok: true, savedAt: new Date().toISOString() };
}
