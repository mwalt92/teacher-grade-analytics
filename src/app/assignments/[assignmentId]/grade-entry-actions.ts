"use server";

import { createClient } from "@/lib/supabase/server";

type SaveGradeEntryInput = {
  assignmentId: string;
  studentId: string;
  points: number;
  missing: boolean;
};

export type SaveGradeEntryResult =
  | { ok: true; savedAt: string; points: number; missing: boolean }
  | { ok: false; error: string };

export async function saveGradeEntry(input: SaveGradeEntryInput): Promise<SaveGradeEntryResult> {
  const { assignmentId, studentId, missing } = input;
  const points = missing ? 0 : Number(input.points);

  if (!assignmentId || !studentId || !Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Enter a valid non-negative score." };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return { ok: false, error: "Your session expired. Sign in again." };

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_date")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false, error: "Assignment not found." };

  const [{ data: teacherSection }, { data: enrollment }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("enrollments").select("id").eq("section_id", assignment.section_id).eq("student_id", studentId).eq("active", true).maybeSingle(),
  ]);
  if (!teacherSection || !enrollment) return { ok: false, error: "You do not have access to enter this grade." };

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
