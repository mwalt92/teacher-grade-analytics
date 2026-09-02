"use server";

import { createClient } from "@/lib/supabase/server";

type AddRetakeInput = {
  assignmentId: string;
  studentId: string;
  points: number;
};

type EditRetakeInput = {
  assignmentId: string;
  studentId: string;
  attemptNumber: number;
  points: number;
};

export type AddRetakeResult =
  | { ok: true; attemptNumber: number; points: number; savedAt: string }
  | { ok: false; error: string };

export type EditRetakeResult =
  | { ok: true; attemptNumber: number; points: number; occurredOn: string }
  | { ok: false; error: string };

async function authorizeRetakeWrite(assignmentId: string, studentId: string) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { ok: false as const, error: "Your session expired. Sign in again." };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_date,allow_retakes,archived")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false as const, error: "Assignment not found." };
  if (assignment.archived) return { ok: false as const, error: "This assignment is archived. Restore it before editing retakes." };
  if (!assignment.allow_retakes) return { ok: false as const, error: "Retakes are not enabled for this assignment." };

  const [{ data: teacherSection }, { data: enrollment }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("enrollments").select("id").eq("section_id", assignment.section_id).eq("student_id", studentId).eq("active", true).maybeSingle(),
  ]);
  if (!teacherSection || !enrollment) return { ok: false as const, error: "You do not have access to edit this retake." };

  return { ok: true as const, supabase, userId, assignment };
}

export async function addRetakeAttempt(input: AddRetakeInput): Promise<AddRetakeResult> {
  const points = Number(input.points);
  if (!input.assignmentId || !input.studentId || !Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Enter a valid non-negative retake score." };
  }

  const auth = await authorizeRetakeWrite(input.assignmentId, input.studentId);
  if (!auth.ok) return auth;
  const { supabase, userId } = auth;

  const { data: record, error: recordError } = await supabase
    .from("grade_records")
    .select("id,missing,exempt")
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

  const { error: statusError } = await supabase.from("grade_records").update({ missing: false, exempt: false }).eq("id", record.id);
  if (statusError) return { ok: false, error: `Retake saved, but grade status could not be cleared: ${statusError.message}` };

  const { error: auditError } = await supabase.from("grade_changes").insert({
    grade_record_id: record.id,
    changed_by: userId,
    old_value: { attempt_count: attempts.length, missing: record.missing, exempt: record.exempt },
    new_value: { attempt_number: attemptNumber, points, missing: false, exempt: false },
    action: "retake_added",
  });
  if (auditError) return { ok: false, error: `Retake saved, but audit logging failed: ${auditError.message}` };

  return { ok: true, attemptNumber, points, savedAt: new Date().toISOString() };
}

export async function editRetakeAttempt(input: EditRetakeInput): Promise<EditRetakeResult> {
  const points = Number(input.points);
  const attemptNumber = Number(input.attemptNumber);
  if (!input.assignmentId || !input.studentId || !Number.isInteger(attemptNumber) || attemptNumber < 2 || !Number.isFinite(points) || points < 0) {
    return { ok: false, error: "Enter a valid retake attempt and non-negative score." };
  }

  const auth = await authorizeRetakeWrite(input.assignmentId, input.studentId);
  if (!auth.ok) return auth;
  const { supabase, userId } = auth;

  const { data: record, error: recordError } = await supabase
    .from("grade_records")
    .select("id,missing,exempt")
    .eq("assignment_id", input.assignmentId)
    .eq("student_id", input.studentId)
    .maybeSingle();
  if (recordError || !record) return { ok: false, error: "Grade record not found." };

  const { data: attempt, error: attemptError } = await supabase
    .from("grade_attempts")
    .select("id,attempt_number,points_earned,occurred_on,is_late")
    .eq("grade_record_id", record.id)
    .eq("attempt_number", attemptNumber)
    .maybeSingle();
  if (attemptError || !attempt) return { ok: false, error: `Retake A${attemptNumber} was not found.` };

  const previousPoints = Number(attempt.points_earned);
  if (previousPoints === points) {
    return { ok: true, attemptNumber, points, occurredOn: attempt.occurred_on };
  }

  const { error: updateError } = await supabase
    .from("grade_attempts")
    .update({ points_earned: points, entered_by: userId })
    .eq("id", attempt.id)
    .eq("grade_record_id", record.id);
  if (updateError) return { ok: false, error: updateError.message };

  const { error: auditError } = await supabase.from("grade_changes").insert({
    grade_record_id: record.id,
    changed_by: userId,
    old_value: {
      attempt_number: attemptNumber,
      points: previousPoints,
      occurred_on: attempt.occurred_on,
      is_late: attempt.is_late,
      missing: record.missing,
      exempt: record.exempt,
    },
    new_value: {
      attempt_number: attemptNumber,
      points,
      occurred_on: attempt.occurred_on,
      is_late: attempt.is_late,
      missing: record.missing,
      exempt: record.exempt,
    },
    action: "retake_edited",
  });
  if (auditError) return { ok: false, error: `Retake score was updated, but audit logging failed: ${auditError.message}` };

  return { ok: true, attemptNumber, points, occurredOn: attempt.occurred_on };
}
