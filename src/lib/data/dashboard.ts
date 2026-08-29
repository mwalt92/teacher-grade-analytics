import { getAssignmentManagementData } from "@/lib/data/assignment-management";
import { getSectionGradebook, getSectionGradingPeriods } from "@/lib/data/grade-calculation";
import { getLatestPowerSchoolSnapshots, POWERSCHOOL_TOLERANCE } from "@/lib/data/powerschool";
import { getSectionRoster } from "@/lib/data/roster";
import { createClient } from "@/lib/supabase/server";

export type DashboardAttentionStudent = {
  studentId: string;
  displayName: string;
  currentGrade: number | null;
  missingCount: number;
  powerSchoolDifference: number | null;
};

export type DashboardRecentAssignment = {
  id: string;
  title: string;
  type: string;
  date: string;
  classAverage: number | null;
  missingCount: number;
  enteredCount: number;
  rosterCount: number;
};

export type TeacherDashboardData = {
  selectedPeriod: { id: string; code: string; name: string } | null;
  periods: { code: string; name: string }[];
  studentCount: number;
  classAverage: number | null;
  missingCount: number;
  retakeCount: number;
  powerSchoolWithinTolerance: number;
  powerSchoolMismatchCount: number;
  powerSchoolNotCapturedCount: number;
  attentionStudents: DashboardAttentionStudent[];
  recentAssignments: DashboardRecentAssignment[];
};

export async function getTeacherDashboardData(sectionId: string, requestedPeriod?: string): Promise<TeacherDashboardData> {
  const supabase = await createClient();
  const [roster, periods, assignmentData] = await Promise.all([
    getSectionRoster(sectionId, "active"),
    getSectionGradingPeriods(sectionId),
    getAssignmentManagementData(sectionId),
  ]);
  const selectablePeriods = periods.filter((period) => period.periodRole !== "exam");
  const selectedPeriod = selectablePeriods.find((period) => period.code === requestedPeriod) ?? selectablePeriods[0] ?? null;
  const studentIds = roster.map((student) => student.studentId);
  const gradebook = selectedPeriod ? await getSectionGradebook(sectionId, studentIds, selectedPeriod.code) : null;
  const gradeRowByStudent = new Map(gradebook?.rows.map((row) => [row.studentId, row]) ?? []);
  const gradedRows = gradebook?.rows.filter((row) => row.overallPercent !== null) ?? [];
  const classAverage = gradedRows.length
    ? gradedRows.reduce((sum, row) => sum + (row.overallPercent ?? 0), 0) / gradedRows.length
    : null;
  const missingCount = gradebook?.rows.reduce((sum, row) => sum + row.missingCount, 0) ?? 0;

  const snapshots = selectedPeriod ? await getLatestPowerSchoolSnapshots(sectionId, selectedPeriod.id, studentIds) : [];
  const snapshotByStudent = new Map(snapshots.map((snapshot) => [snapshot.studentId, snapshot]));
  let powerSchoolWithinTolerance = 0;
  let powerSchoolMismatchCount = 0;
  for (const student of roster) {
    const website = gradeRowByStudent.get(student.studentId)?.overallPercent ?? null;
    const snapshot = snapshotByStudent.get(student.studentId);
    if (website === null || !snapshot) continue;
    if (Math.abs(website - snapshot.powerSchoolPercent) >= POWERSCHOOL_TOLERANCE) powerSchoolMismatchCount += 1;
    else powerSchoolWithinTolerance += 1;
  }

  const attentionStudents = roster
    .map((student): DashboardAttentionStudent => {
      const row = gradeRowByStudent.get(student.studentId);
      const snapshot = snapshotByStudent.get(student.studentId);
      const difference = row?.overallPercent != null && snapshot ? row.overallPercent - snapshot.powerSchoolPercent : null;
      return {
        studentId: student.studentId,
        displayName: student.displayName,
        currentGrade: row?.overallPercent ?? null,
        missingCount: row?.missingCount ?? 0,
        powerSchoolDifference: difference,
      };
    })
    .filter((student) => student.missingCount > 0 || (student.powerSchoolDifference !== null && Math.abs(student.powerSchoolDifference) >= POWERSCHOOL_TOLERANCE))
    .sort((a, b) => b.missingCount - a.missingCount || Math.abs(b.powerSchoolDifference ?? 0) - Math.abs(a.powerSchoolDifference ?? 0))
    .slice(0, 4);

  const periodIds = new Set(periods.map((period) => period.id));
  const { data: componentRows } = periodIds.size
    ? await supabase.from("grading_period_components").select("parent_period_id,component_period_id").in("parent_period_id", [...periodIds])
    : { data: [] as { parent_period_id: string; component_period_id: string }[] };
  const childrenByParent = new Map<string, string[]>();
  for (const row of componentRows ?? []) {
    const list = childrenByParent.get(row.parent_period_id) ?? [];
    list.push(row.component_period_id);
    childrenByParent.set(row.parent_period_id, list);
  }
  const periodById = new Map(periods.map((period) => [period.id, period]));
  function directPeriodIds(periodId: string, stack: string[] = []): string[] {
    if (stack.includes(periodId)) return [];
    const period = periodById.get(periodId);
    if (!period) return [];
    if (period.calculationMode === "direct") return [periodId];
    return (childrenByParent.get(periodId) ?? []).flatMap((childId) => directPeriodIds(childId, [...stack, periodId]));
  }
  const includedPeriodIds = new Set(selectedPeriod ? directPeriodIds(selectedPeriod.id) : []);
  const relevantAssignments = (assignmentData?.assignments ?? [])
    .filter((assignment) => !assignment.archived && assignment.gradingPeriod && includedPeriodIds.has(assignment.gradingPeriod.id));
  const relevantAssignmentIds = relevantAssignments.map((assignment) => assignment.id);

  let gradeRecords: { id: string; assignment_id: string; student_id: string; missing: boolean; exempt: boolean }[] = [];
  if (relevantAssignmentIds.length && studentIds.length) {
    const { data } = await supabase
      .from("grade_records")
      .select("id,assignment_id,student_id,missing,exempt")
      .in("assignment_id", relevantAssignmentIds)
      .in("student_id", studentIds);
    gradeRecords = data ?? [];
  }
  const recordIds = gradeRecords.map((record) => record.id);
  let attempts: { grade_record_id: string; attempt_number: number; points_earned: number }[] = [];
  if (recordIds.length) {
    const { data } = await supabase
      .from("grade_attempts")
      .select("grade_record_id,attempt_number,points_earned")
      .in("grade_record_id", recordIds);
    attempts = data ?? [];
  }
  const attemptsByRecord = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const list = attemptsByRecord.get(attempt.grade_record_id) ?? [];
    list.push(attempt);
    attemptsByRecord.set(attempt.grade_record_id, list);
  }
  const recordsByAssignment = new Map<string, typeof gradeRecords>();
  for (const record of gradeRecords) {
    const list = recordsByAssignment.get(record.assignment_id) ?? [];
    list.push(record);
    recordsByAssignment.set(record.assignment_id, list);
  }

  const retakeCount = attempts.filter((attempt) => attempt.attempt_number > 1).length;
  const recentAssignments = relevantAssignments.slice(0, 6).map((assignment): DashboardRecentAssignment => {
    const records = recordsByAssignment.get(assignment.id) ?? [];
    const percents: number[] = [];
    let enteredCount = 0;
    let assignmentMissingCount = 0;
    for (const record of records) {
      if (record.exempt) continue;
      if (record.missing) {
        assignmentMissingCount += 1;
        enteredCount += 1;
        percents.push(0);
        continue;
      }
      const recordAttempts = attemptsByRecord.get(record.id) ?? [];
      if (!recordAttempts.length) continue;
      enteredCount += 1;
      const best = Math.max(...recordAttempts.map((attempt) => Number(attempt.points_earned)));
      percents.push((best / assignment.pointsPossible) * 100);
    }
    return {
      id: assignment.id,
      title: assignment.title,
      type: assignment.assignmentType?.name ?? "—",
      date: assignment.assignmentDate,
      classAverage: percents.length ? percents.reduce((sum, percent) => sum + percent, 0) / percents.length : null,
      missingCount: assignmentMissingCount,
      enteredCount,
      rosterCount: roster.length,
    };
  });

  return {
    selectedPeriod: selectedPeriod ? { id: selectedPeriod.id, code: selectedPeriod.code, name: selectedPeriod.name } : null,
    periods: selectablePeriods.map((period) => ({ code: period.code, name: period.name })),
    studentCount: roster.length,
    classAverage,
    missingCount,
    retakeCount,
    powerSchoolWithinTolerance,
    powerSchoolMismatchCount,
    powerSchoolNotCapturedCount: Math.max(0, roster.length - snapshots.length),
    attentionStudents,
    recentAssignments,
  };
}
