"use server";

import { createClient } from "@/lib/supabase/server";

type AddRetakeInput = {
  assignmentId: string;
  studentId: string;
  points: number;
};

export type AddRetakeResult =
  | { ok: true; attemptNumber: number; points: number; savedAt: string }
  | { ok: false; error: string };

export async function addRetakeAttempt(input: AddRetakeInput): Promise<AddRetakeResult> {
  const points = Number(input.points);
  if (!input.assignmentId || !input.studentId || !Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Enter a valid non-negative retake score." };
  }

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_date,allow_retakes,archived")
    .eq("id", input.assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false, error: "Assignment not found." };
  if (assignment.archived) return { ok: false, error: "This assignment is archived. Restore it before adding a retake." };
  if (!assignment.allow_retakes) return { ok: false, error: "Retakes are not enabled for this assignment." };

  const [{ data: teacherSection }, { data: enrollment }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("enrollments").select("id").eq("section_id", assignment.section_id).eq("student_id", input.studentId).eq("active", true).maybeSingle(),
  ]);
  if (!teacherSection || !enrollment) return { ok: false, error: "You do not have access to enter this retake." };

  const { data: record, error: recordError } = await supabase
    .from("grade_records")
    .select("id,missing")
    .eq("assignment_id", input.assignmentId)
    .eq("student_id", input.studentId)
    .maybeSingle();
  if (recordError || !record) return { ok: false, error: "Enter the original score before adding a retake." };

  const { data: attempts, error: attemptsError } = await supabase
    .from("grade_attempts")
    .select("attempt_number,points_earned")
    .eq("grade_record_id", record.id)
    .order("attempt_number", { ascending: true });
  if (attemptsError) return { ok: false, error: attemptsError.message };
  if (!attempts?.some((attempt) => attempt.attempt_number === 1)) {
    return { ok: false, error: "Enter the original score before adding a retake." };
  }

  const attemptNumber = Math.max(...attempts.map((attempt) => attempt.attempt_number)) + 1;
  const { error: insertError } = await supabase.from("grade_attempts").insert({
    grade_record_id: record.id,
    attempt_number: attemptNumber,
    points_earned: points,
    occurred_on: new Date().toISOString().slice(0, 10),
    is_late: false,
    entered_by: userId,
  });
  if (insertError) return { ok: false, error: insertError.message };

  const { error: missingError } = await supabase.from("grade_records").update({ missing: false }).eq("id", record.id);
  if (missingError) return { ok: false, error: `Retake saved, but Missing could not be cleared: ${missingError.message}` };

  const { error: auditError } = await supabase.from("grade_changes").insert({
    grade_record_id: record.id,
    changed_by: userId,
    old_value: { attempt_count: attempts.length, missing: record.missing },
    new_value: { attempt_number: attemptNumber, points, missing: false },
    action: "retake_added",
  });
  if (auditError) return { ok: false, error: `Retake saved, but audit logging failed: ${auditError.message}` };

  return { ok: true, attemptNumber, points, savedAt: new Date().toISOString() };
}
