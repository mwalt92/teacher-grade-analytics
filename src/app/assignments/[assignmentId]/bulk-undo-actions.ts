"use server";

import { createClient } from "@/lib/supabase/server";

export type GradeSnapshot = {
  studentId: string;
  points: number | null;
  missing: boolean;
};

type RestoreGradeEntriesBulkInput = {
  assignmentId: string;
  snapshots: GradeSnapshot[];
};

export type RestoreGradeEntriesBulkResult =
  | { ok: true; savedAt: string; count: number }
  | { ok: false; error: string };

export async function restoreGradeEntriesBulk(input: RestoreGradeEntriesBulkInput): Promise<RestoreGradeEntriesBulkResult> {
  const { assignmentId, snapshots } = input;

  if (!assignmentId || !snapshots.length) {
    return { ok: false, error: "There is nothing to undo." };
  }

  const studentIds = snapshots.map((snapshot) => snapshot.studentId);
  const uniqueStudentIds = [...new Set(studentIds)];
  if (uniqueStudentIds.length !== snapshots.length) {
    return { ok: false, error: "Undo data contains duplicate students." };
  }

  const invalidSnapshot = snapshots.some((snapshot) => {
    if (!snapshot.studentId) return true;
    if (snapshot.points == null) return snapshot.missing;
    return !Number.isFinite(Number(snapshot.points)) || Number(snapshot.points) < 0;
  });
  if (invalidSnapshot) return { ok: false, error: "Undo data is invalid." };

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { ok: false, error: "Your session expired. Sign in again." };
  }

  const { data: assignment, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,assignment_date,archived")
    .eq("id", assignmentId)
    .maybeSingle();
  if (assignmentError || !assignment) return { ok: false, error: "Assignment not found." };
  if (assignment.archived) return { ok: false, error: "This assignment is archived. Restore it before undoing grade changes." };

  const [{ data: teacherSection }, { data: enrollments }] = await Promise.all([
    supabase
      .from("teacher_sections")
      .select("section_id")
      .eq("teacher_id", userId)
      .eq("section_id", assignment.section_id)
      .maybeSingle(),
    supabase
      .from("enrollments")
      .select("student_id")
      .eq("section_id", assignment.section_id)
      .eq("active", true)
      .in("student_id", uniqueStudentIds),
  ]);

  if (!teacherSection || !enrollments || enrollments.length !== uniqueStudentIds.length) {
    return { ok: false, error: "You do not have access to restore one or more of these grades." };
  }

  const { data: currentRecords, error: recordLoadError } = await supabase
    .from("grade_records")
    .select("id,student_id,missing")
    .eq("assignment_id", assignmentId)
    .in("student_id", uniqueStudentIds);
  if (recordLoadError) return { ok: false, error: recordLoadError.message };

  const currentRecordIds = (currentRecords ?? []).map((record) => record.id);
  const { data: currentAttempts, error: attemptLoadError } = currentRecordIds.length
    ? await supabase
        .from("grade_attempts")
        .select("grade_record_id,points_earned")
        .eq("attempt_number", 1)
        .in("grade_record_id", currentRecordIds)
    : { data: [], error: null };
  if (attemptLoadError) return { ok: false, error: attemptLoadError.message };

  const currentRecordByStudent = new Map((currentRecords ?? []).map((record) => [record.student_id, record]));
  const currentAttemptByRecord = new Map((currentAttempts ?? []).map((attempt) => [attempt.grade_record_id, attempt]));

  const scoredSnapshots = snapshots.filter((snapshot) => snapshot.points != null);
  const blankSnapshots = snapshots.filter((snapshot) => snapshot.points == null && !snapshot.missing);

  const restoredRecordIdByStudent = new Map<string, string>();
  (currentRecords ?? []).forEach((record) => restoredRecordIdByStudent.set(record.student_id, record.id));

  if (scoredSnapshots.length) {
    const { data: restoredRecords, error: restoreRecordError } = await supabase
      .from("grade_records")
      .upsert(
        scoredSnapshots.map((snapshot) => ({
          assignment_id: assignmentId,
          student_id: snapshot.studentId,
          missing: snapshot.missing,
          exempt: false,
        })),
        { onConflict: "assignment_id,student_id" },
      )
      .select("id,student_id");

    if (restoreRecordError || !restoredRecords || restoredRecords.length !== scoredSnapshots.length) {
      return { ok: false, error: restoreRecordError?.message ?? "Could not restore all grade records." };
    }

    restoredRecords.forEach((record) => restoredRecordIdByStudent.set(record.student_id, record.id));

    const { error: restoreAttemptError } = await supabase
      .from("grade_attempts")
      .upsert(
        scoredSnapshots.map((snapshot) => ({
          grade_record_id: restoredRecordIdByStudent.get(snapshot.studentId)!,
          attempt_number: 1,
          points_earned: snapshot.missing ? 0 : Number(snapshot.points),
          occurred_on: assignment.assignment_date,
          is_late: false,
          entered_by: userId,
        })),
        { onConflict: "grade_record_id,attempt_number" },
      );
    if (restoreAttemptError) return { ok: false, error: restoreAttemptError.message };
  }

  if (blankSnapshots.length) {
    const blankRecordIds = blankSnapshots
      .map((snapshot) => restoredRecordIdByStudent.get(snapshot.studentId))
      .filter((id): id is string => Boolean(id));

    if (blankRecordIds.length) {
      const { error: deleteAttemptError } = await supabase
        .from("grade_attempts")
        .delete()
        .eq("attempt_number", 1)
        .in("grade_record_id", blankRecordIds);
      if (deleteAttemptError) return { ok: false, error: deleteAttemptError.message };

      const { error: clearRecordError } = await supabase
        .from("grade_records")
        .update({ missing: false, exempt: false })
        .in("id", blankRecordIds);
      if (clearRecordError) return { ok: false, error: clearRecordError.message };
    }
  }

  const auditRows = snapshots.flatMap((snapshot) => {
    const recordId = restoredRecordIdByStudent.get(snapshot.studentId);
    if (!recordId) return [];
    const currentRecord = currentRecordByStudent.get(snapshot.studentId);
    const currentAttempt = currentRecord ? currentAttemptByRecord.get(currentRecord.id) : undefined;
    return [{
      grade_record_id: recordId,
      changed_by: userId,
      old_value: currentRecord || currentAttempt
        ? {
            missing: currentRecord?.missing ?? false,
            points: currentAttempt ? Number(currentAttempt.points_earned) : null,
          }
        : null,
      new_value: {
        missing: snapshot.missing,
        points: snapshot.points == null ? null : snapshot.missing ? 0 : Number(snapshot.points),
      },
      action: "bulk_grade_entry_restored",
    }];
  });

  if (auditRows.length) {
    const { error: auditError } = await supabase.from("grade_changes").insert(auditRows);
    if (auditError) return { ok: false, error: `Grades restored, but audit logging failed: ${auditError.message}` };
  }

  return { ok: true, savedAt: new Date().toISOString(), count: snapshots.length };
}
