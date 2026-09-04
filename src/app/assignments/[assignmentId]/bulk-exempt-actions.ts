"use server";

import { createClient } from "@/lib/supabase/server";

type BulkExemptInput = {
  assignmentId: string;
  studentIds: string[];
};

export type BulkExemptResult =
  | { ok: true; savedAt: string; count: number }
  | { ok: false; error: string };

export async function setGradeExemptBulk(input: BulkExemptInput): Promise<BulkExemptResult> {
  const assignmentId = String(input.assignmentId ?? "");
  const studentIds = [...new Set((input.studentIds ?? []).filter(Boolean))];
  if (!assignmentId || !studentIds.length) return { ok: false, error: "No blank grades were selected for exemption." };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return { ok: false, error: "Your session expired. Sign in again." };

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,archived")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false, error: "Assignment not found." };
  if (assignment.archived) return { ok: false, error: "This assignment is archived. Restore it before changing grades." };

  const [{ data: teacherSection }, { data: enrollments }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("enrollments").select("student_id").eq("section_id", assignment.section_id).eq("active", true).in("student_id", studentIds),
  ]);
  if (!teacherSection || !enrollments || enrollments.length !== studentIds.length) {
    return { ok: false, error: "You do not have access to update one or more of these students." };
  }

  const { data: existingRecords, error: existingError } = await supabase
    .from("grade_records")
    .select("id,student_id,missing,exempt")
    .eq("assignment_id", assignmentId)
    .in("student_id", studentIds);
  if (existingError) return { ok: false, error: existingError.message };

  const existingIds = (existingRecords ?? []).map((record) => record.id);
  const { data: attempts, error: attemptError } = existingIds.length
    ? await supabase.from("grade_attempts").select("grade_record_id,points_earned").eq("attempt_number", 1).in("grade_record_id", existingIds)
    : { data: [], error: null };
  if (attemptError) return { ok: false, error: attemptError.message };

  const recordByStudent = new Map((existingRecords ?? []).map((record) => [record.student_id, record]));
  const attemptByRecord = new Map((attempts ?? []).map((attempt) => [attempt.grade_record_id, attempt]));

  const { data: savedRecords, error: saveError } = await supabase
    .from("grade_records")
    .upsert(studentIds.map((studentId) => ({ assignment_id: assignmentId, student_id: studentId, missing: false, exempt: true })), { onConflict: "assignment_id,student_id" })
    .select("id,student_id");
  if (saveError || !savedRecords || savedRecords.length !== studentIds.length) {
    return { ok: false, error: saveError?.message ?? "Could not mark all remaining students exempt." };
  }

  const auditRows = savedRecords.map((saved) => {
    const oldRecord = recordByStudent.get(saved.student_id);
    const oldAttempt = oldRecord ? attemptByRecord.get(oldRecord.id) : undefined;
    return {
      grade_record_id: saved.id,
      changed_by: userId,
      old_value: oldRecord
        ? { missing: oldRecord.missing, exempt: oldRecord.exempt, points: oldAttempt ? Number(oldAttempt.points_earned) : null }
        : null,
      new_value: { missing: false, exempt: true, points: oldAttempt ? Number(oldAttempt.points_earned) : null },
      action: "bulk_grade_entry_exempted",
    };
  });

  const { error: auditError } = await supabase.from("grade_changes").insert(auditRows);
  if (auditError) return { ok: false, error: `Exemptions saved, but audit logging failed: ${auditError.message}` };

  return { ok: true, savedAt: new Date().toISOString(), count: studentIds.length };
}
