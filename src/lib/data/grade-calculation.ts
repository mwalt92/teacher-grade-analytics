import { calculateGrade } from "@/lib/grading/engine";
import type { GradeRecord, GradeResult, GradingCategory, GradingRules } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";

export type GradingPeriodSummary = {
  id: string;
  code: string;
  name: string;
};

export type StudentGradeCalculation = {
  studentId: string;
  sectionId: string;
  gradingPeriod: GradingPeriodSummary;
  rules: GradingRules;
  result: GradeResult;
};

export function gradingCategoryFromName(name: string): GradingCategory {
  const normalized = name.trim().toLowerCase();
  if (normalized === "participation") return "participation";
  if (normalized === "quiz" || normalized === "quizzes") return "quiz";
  if (normalized === "test" || normalized === "tests") return "test";
  throw new Error(`Unsupported grading category: ${name}`);
}

export async function getSectionGradingPeriods(sectionId: string): Promise<GradingPeriodSummary[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_periods")
    .select("id,code,name")
    .eq("section_id", sectionId);

  if (error || !data) return [];
  const order = new Map([["Q1", 1], ["Q2", 2], ["Q3", 3], ["Q4", 4], ["S1", 5], ["S2", 6]]);
  return data.sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
}

export async function getStudentGradeCalculation(
  sectionId: string,
  studentId: string,
  gradingPeriodCode: string,
): Promise<StudentGradeCalculation | null> {
  const supabase = await createClient();

  const [{ data: period, error: periodError }, { data: categories, error: categoriesError }] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("id,code,name")
      .eq("section_id", sectionId)
      .eq("code", gradingPeriodCode)
      .maybeSingle(),
    supabase
      .from("grading_categories")
      .select("id,name,weight,drop_lowest")
      .eq("section_id", sectionId),
  ]);

  if (periodError || categoriesError || !period || !categories?.length) return null;

  const categoryById = new Map<string, { category: GradingCategory; weight: number; dropLowest: number }>();
  const rules: GradingRules = {
    categoryWeights: { participation: 0, quiz: 0, test: 0 },
    dropLowest: {},
    retakePolicy: "highest",
  };

  for (const categoryRow of categories) {
    const category = gradingCategoryFromName(categoryRow.name);
    const weight = Number(categoryRow.weight);
    const dropLowest = Number(categoryRow.drop_lowest);
    categoryById.set(categoryRow.id, { category, weight, dropLowest });
    rules.categoryWeights[category] = weight;
    if (dropLowest > 0) rules.dropLowest[category] = dropLowest;
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,category_id,title,assignment_date,points_possible")
    .eq("section_id", sectionId)
    .eq("grading_period_id", period.id)
    .order("assignment_date", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignmentsError || !assignments) return null;
  if (assignments.length === 0) {
    return {
      studentId,
      sectionId,
      gradingPeriod: period,
      rules,
      result: calculateGrade([], rules),
    };
  }

  const assignmentIds = assignments.map((assignment) => assignment.id);
  const { data: gradeRows, error: gradeRowsError } = await supabase
    .from("grade_records")
    .select("id,assignment_id,missing,exempt")
    .eq("student_id", studentId)
    .in("assignment_id", assignmentIds);

  if (gradeRowsError || !gradeRows) return null;

  const gradeRowByAssignmentId = new Map(gradeRows.map((row) => [row.assignment_id, row]));
  const gradeRecordIds = gradeRows.map((row) => row.id);
  const attemptsByGradeRecordId = new Map<string, { id: string; points_earned: number; attempt_number: number; occurred_on: string }[]>();

  if (gradeRecordIds.length > 0) {
    const { data: attempts, error: attemptsError } = await supabase
      .from("grade_attempts")
      .select("id,grade_record_id,points_earned,attempt_number,occurred_on")
      .in("grade_record_id", gradeRecordIds)
      .order("attempt_number", { ascending: true });

    if (attemptsError || !attempts) return null;
    for (const attempt of attempts) {
      const list = attemptsByGradeRecordId.get(attempt.grade_record_id) ?? [];
      list.push(attempt);
      attemptsByGradeRecordId.set(attempt.grade_record_id, list);
    }
  }

  const records: GradeRecord[] = assignments.map((assignment) => {
    const categoryConfig = categoryById.get(assignment.category_id);
    if (!categoryConfig) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);

    const gradeRow = gradeRowByAssignmentId.get(assignment.id);
    const attempts = gradeRow ? attemptsByGradeRecordId.get(gradeRow.id) ?? [] : [];
    const possible = Number(assignment.points_possible);

    return {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      assignmentDate: assignment.assignment_date,
      gradingPeriodCode: period.code,
      category: categoryConfig.category,
      missing: gradeRow?.missing ?? false,
      exempt: gradeRow?.exempt ?? false,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        earned: Number(attempt.points_earned),
        possible,
        attemptNumber: attempt.attempt_number,
        occurredAt: attempt.occurred_on,
      })),
    };
  });

  return {
    studentId,
    sectionId,
    gradingPeriod: period,
    rules,
    result: calculateGrade(records, rules),
  };
}
