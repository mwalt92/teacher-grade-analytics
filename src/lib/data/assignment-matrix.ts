import { calculateGrade } from "@/lib/grading/engine";
import { buildRulesFromCategories } from "@/lib/grading/config";
import type { GradeRecord, GradingCategory, GradingRules } from "@/lib/grading/types";
import { getCourseOfferingForSection } from "@/lib/data/course-offering";
import { createClient } from "@/lib/supabase/server";

export type AssignmentMatrixAssignment = {
  id: string;
  title: string;
  assignmentDate: string;
  pointsPossible: number;
  category: GradingCategory;
  allowRetakes: boolean;
};

export type AssignmentMatrixAttempt = { id: string; attemptNumber: number; earned: number };

export type AssignmentMatrixCell = {
  assignmentId: string;
  status: "counted" | "dropped" | "missing" | "unentered" | "exempt";
  missing: boolean;
  exempt: boolean;
  earned: number | null;
  attemptOneEarned: number | null;
  possible: number;
  percent: number | null;
  countedAttemptNumber: number | null;
  attemptCount: number;
  attempts: AssignmentMatrixAttempt[];
};

export type AssignmentMatrixStudent = { studentId: string; cells: Record<string, AssignmentMatrixCell> };

export type AssignmentMatrix = {
  sectionId: string;
  gradingPeriod: { id: string; code: string; name: string };
  rules: GradingRules;
  assignments: AssignmentMatrixAssignment[];
  students: AssignmentMatrixStudent[];
  totals: { entered: number; missing: number; dropped: number; exempt: number; unentered: number };
};

export async function getAssignmentMatrix(sectionId: string, studentIds: string[], gradingPeriodCode: string): Promise<AssignmentMatrix | null> {
  const scope = await getCourseOfferingForSection(sectionId);
  if (!scope) return null;
  const supabase = await createClient();
  const [{ data: period, error: periodError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase.from("grading_periods").select("id,code,name").eq("offering_id", scope.offeringId).eq("code", gradingPeriodCode).maybeSingle(),
    supabase.from("grading_categories").select("id,name,code,weight,drop_lowest,calculation_method,sort_order").eq("offering_id", scope.offeringId).order("sort_order", { ascending: true }),
  ]);
  if (periodError || categoriesError || !period || !categories?.length) return null;

  const { categoryById, rules } = buildRulesFromCategories(categories);
  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,category_id,title,assignment_date,points_possible,allow_retakes,created_at")
    .eq("section_id", sectionId)
    .eq("grading_period_id", period.id)
    .eq("archived", false)
    .order("assignment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (assignmentsError || !assignments) return null;

  const assignmentIds = assignments.map((assignment) => assignment.id);
  let gradeRows: { id:string; assignment_id:string; student_id:string; missing:boolean; exempt:boolean }[] = [];
  if (studentIds.length > 0 && assignmentIds.length > 0) {
    const { data, error } = await supabase.from("grade_records").select("id,assignment_id,student_id,missing,exempt").in("student_id", studentIds).in("assignment_id", assignmentIds);
    if (error || !data) return null;
    gradeRows = data;
  }

  const gradeRecordIds = gradeRows.map((row) => row.id);
  let attempts: { id:string; grade_record_id:string; points_earned:number; attempt_number:number; occurred_on:string }[] = [];
  if (gradeRecordIds.length > 0) {
    const { data, error } = await supabase.from("grade_attempts").select("id,grade_record_id,points_earned,attempt_number,occurred_on").in("grade_record_id", gradeRecordIds).order("attempt_number", { ascending: true });
    if (error || !data) return null;
    attempts = data;
  }

  const gradeRowByStudentAssignment = new Map<string, (typeof gradeRows)[number]>();
  for (const row of gradeRows) gradeRowByStudentAssignment.set(`${row.student_id}:${row.assignment_id}`, row);
  const attemptsByGradeRecordId = new Map<string, typeof attempts>();
  for (const attempt of attempts) { const list = attemptsByGradeRecordId.get(attempt.grade_record_id) ?? []; list.push(attempt); attemptsByGradeRecordId.set(attempt.grade_record_id, list); }

  const matrixAssignments: AssignmentMatrixAssignment[] = assignments.map((assignment) => {
    const config = categoryById.get(assignment.category_id);
    if (!config) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
    return { id: assignment.id, title: assignment.title, assignmentDate: assignment.assignment_date, pointsPossible: Number(assignment.points_possible), category: config.category, allowRetakes: Boolean(assignment.allow_retakes) };
  });
  const matrixAssignmentById = new Map(matrixAssignments.map((assignment) => [assignment.id, assignment]));

  const totals = { entered: 0, missing: 0, dropped: 0, exempt: 0, unentered: 0 };
  const students: AssignmentMatrixStudent[] = studentIds.map((studentId) => {
    const records: GradeRecord[] = assignments.map((assignment) => {
      const config = categoryById.get(assignment.category_id);
      if (!config) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
      const gradeRow = gradeRowByStudentAssignment.get(`${studentId}:${assignment.id}`);
      const rowAttempts = gradeRow ? attemptsByGradeRecordId.get(gradeRow.id) ?? [] : [];
      const possible = Number(assignment.points_possible);
      return { assignmentId: assignment.id, assignmentTitle: assignment.title, assignmentDate: assignment.assignment_date, gradingPeriodCode: period.code, category: config.category, pointsPossible: possible, missing: gradeRow?.missing ?? false, exempt: gradeRow?.exempt ?? false, attempts: rowAttempts.map((attempt) => ({ id: attempt.id, earned: Number(attempt.points_earned), possible, attemptNumber: attempt.attempt_number, occurredAt: attempt.occurred_on })) };
    });

    const result = calculateGrade(records, rules);
    const cells: Record<string, AssignmentMatrixCell> = {};
    for (const line of result.audit) {
      const assignment = matrixAssignmentById.get(line.assignmentId);
      if (!assignment) continue;
      const selectedAttempt = line.countedAttemptId ? line.attempts.find((attempt) => attempt.attemptId === line.countedAttemptId) ?? null : null;
      const attemptOne = line.attempts.find((attempt) => attempt.attemptNumber === 1) ?? null;
      cells[line.assignmentId] = { assignmentId: line.assignmentId, status: line.status, missing: line.missing, exempt: line.exempt, earned: selectedAttempt?.earned ?? null, attemptOneEarned: attemptOne?.earned ?? null, possible: assignment.pointsPossible, percent: line.percent, countedAttemptNumber: line.countedAttemptNumber, attemptCount: line.attempts.length, attempts: line.attempts.map((attempt) => ({ id: attempt.attemptId, attemptNumber: attempt.attemptNumber, earned: attempt.earned })) };
      if (line.missing) totals.missing += 1;
      if (line.status === "dropped") totals.dropped += 1;
      if (line.status === "exempt") totals.exempt += 1;
      else if (line.status === "unentered") totals.unentered += 1;
      else if (!line.missing) totals.entered += 1;
    }
    return { studentId, cells };
  });

  return { sectionId, gradingPeriod: period, rules, assignments: matrixAssignments, students, totals };
}
