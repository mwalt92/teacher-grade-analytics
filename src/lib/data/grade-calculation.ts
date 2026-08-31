import { calculateGrade, calculateSemesterGrade } from "@/lib/grading/engine";
import { buildRulesFromCategories, normalizeCategoryCode } from "@/lib/grading/config";
import type { CategoryCalculationMethod, GradeAuditLine, GradeRecord, GradeResult, GradingCategory, GradingRules, SemesterGradeResult } from "@/lib/grading/types";
import { getCourseOfferingForSection } from "@/lib/data/course-offering";
import { createClient } from "@/lib/supabase/server";

export type GradingPeriodMode = "direct" | "composite";
export type GradingPeriodRole = "standard" | "exam";
export type GradingPeriodSummary = {
  id: string;
  code: string;
  name: string;
  calculationMode: GradingPeriodMode;
  periodRole: GradingPeriodRole;
  sortOrder: number;
};
export type StudentGradeCalculation = { studentId: string; sectionId: string; gradingPeriod: GradingPeriodSummary; rules: GradingRules; result: GradeResult };
export type StudentPeriodCalculation =
  | ({ mode: "direct" } & StudentGradeCalculation)
  | {
      mode: "composite";
      studentId: string;
      sectionId: string;
      gradingPeriod: GradingPeriodSummary;
      rules: GradingRules;
      components: { weight: number; calculation: StudentPeriodCalculation }[];
      result: SemesterGradeResult;
    };
export type StudentSemesterCalculation = {
  studentId: string;
  sectionId: string;
  semesterCode: "S1" | "S2";
  semesterName: string;
  quarterCalculations: StudentGradeCalculation[];
  examCalculation: StudentGradeCalculation | null;
  result: SemesterGradeResult;
};
export type SectionGradebookRow = {
  studentId: string;
  overallPercent: number | null;
  categoryPercents: Record<GradingCategory, number>;
  componentPercents: Record<string, number | null>;
  missingCount: number;
  unenteredCount: number;
  assignmentCount: number;
};
export type SectionGradebookCalculation = {
  sectionId: string;
  gradingPeriod: GradingPeriodSummary;
  mode: GradingPeriodMode;
  rules: GradingRules;
  rows: SectionGradebookRow[];
};

type CalculationOptions = { calculationMethodOverride?: CategoryCalculationMethod };
type CategoryRow = {
  id: string;
  name: string;
  code: string;
  weight: number | string;
  drop_lowest: number | string;
  calculation_method: string;
  sort_order: number | string;
};
type PeriodRow = {
  id: string;
  code: string;
  name: string;
  calculation_mode: string;
  period_role: string;
  sort_order: number | string;
};
type ComponentRow = {
  parent_period_id: string;
  component_period_id: string;
  weight: number | string;
  sort_order: number | string;
};

function normalizePeriod(row: PeriodRow): GradingPeriodSummary {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    calculationMode: row.calculation_mode === "composite" ? "composite" : "direct",
    periodRole: row.period_role === "exam" ? "exam" : "standard",
    sortOrder: Number(row.sort_order) || 0,
  };
}

function overallPercent(calculation: StudentPeriodCalculation): number | null {
  return calculation.result.overallPercent;
}

export function gradingCategoryFromName(name: string): GradingCategory {
  const normalized = name.trim().toLowerCase();
  if (normalized === "quizzes") return "quiz";
  if (normalized === "tests") return "test";
  if (normalized === "assessments") return "assessment";
  if (normalized === "projects") return "project";
  return normalizeCategoryCode(name);
}

export async function getSectionGradingPeriods(sectionId: string): Promise<GradingPeriodSummary[]> {
  const scope = await getCourseOfferingForSection(sectionId);
  if (!scope) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_periods")
    .select("id,code,name,calculation_mode,period_role,sort_order")
    .eq("offering_id", scope.offeringId)
    .order("sort_order", { ascending: true })
    .order("code", { ascending: true });
  if (error || !data) return [];
  return (data as PeriodRow[]).map(normalizePeriod);
}

async function loadCategoryRules(sectionId: string, options?: CalculationOptions) {
  const scope = await getCourseOfferingForSection(sectionId);
  if (!scope) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("grading_categories")
    .select("id,name,code,weight,drop_lowest,calculation_method,sort_order")
    .eq("offering_id", scope.offeringId)
    .order("sort_order", { ascending: true })
    .order("name", { ascending: true });
  if (error || !data?.length) return null;
  return buildRulesFromCategories(data as CategoryRow[], options?.calculationMethodOverride);
}

async function calculateDirectStudentPeriod(
  sectionId: string,
  studentId: string,
  period: GradingPeriodSummary,
  options?: CalculationOptions,
): Promise<StudentGradeCalculation | null> {
  const supabase = await createClient();
  const categoryRules = await loadCategoryRules(sectionId, options);
  if (!categoryRules) return null;
  const { categoryById, rules } = categoryRules;
  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,category_id,title,assignment_date,points_possible")
    .eq("section_id", sectionId)
    .eq("grading_period_id", period.id)
    .eq("archived", false)
    .order("assignment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (assignmentsError || !assignments) return null;
  if (assignments.length === 0) return { studentId, sectionId, gradingPeriod: period, rules, result: calculateGrade([], rules) };

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
    const config = categoryById.get(assignment.category_id);
    if (!config) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
    const row = gradeRowByAssignmentId.get(assignment.id);
    const attempts = row ? attemptsByGradeRecordId.get(row.id) ?? [] : [];
    const possible = Number(assignment.points_possible);
    return {
      assignmentId: assignment.id,
      assignmentTitle: assignment.title,
      assignmentDate: assignment.assignment_date,
      gradingPeriodCode: period.code,
      category: config.category,
      pointsPossible: possible,
      missing: row?.missing ?? false,
      exempt: row?.exempt ?? false,
      attempts: attempts.map((attempt) => ({
        id: attempt.id,
        earned: Number(attempt.points_earned),
        possible,
        attemptNumber: attempt.attempt_number,
        occurredAt: attempt.occurred_on,
      })),
    };
  });
  return { studentId, sectionId, gradingPeriod: period, rules, result: calculateGrade(records, rules) };
}

export async function getStudentPeriodCalculation(
  sectionId: string,
  studentId: string,
  gradingPeriodCode: string,
  options?: CalculationOptions,
  stack: string[] = [],
): Promise<StudentPeriodCalculation | null> {
  if (stack.includes(gradingPeriodCode)) throw new Error(`Circular grading-period composition detected at ${gradingPeriodCode}.`);
  const scope = await getCourseOfferingForSection(sectionId);
  if (!scope) return null;
  const supabase = await createClient();
  const [{ data: periodRow, error: periodError }, categoryRules] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("id,code,name,calculation_mode,period_role,sort_order")
      .eq("offering_id", scope.offeringId)
      .eq("code", gradingPeriodCode)
      .maybeSingle(),
    loadCategoryRules(sectionId, options),
  ]);
  if (periodError || !periodRow || !categoryRules) return null;
  const period = normalizePeriod(periodRow as PeriodRow);
  if (period.calculationMode === "direct") {
    const direct = await calculateDirectStudentPeriod(sectionId, studentId, period, options);
    return direct ? { mode: "direct", ...direct } : null;
  }

  const { data: componentRows, error: componentError } = await supabase
    .from("grading_period_components")
    .select("parent_period_id,component_period_id,weight,sort_order")
    .eq("parent_period_id", period.id)
    .order("sort_order", { ascending: true });
  if (componentError || !componentRows) return null;
  const componentIds = componentRows.map((row) => row.component_period_id);
  const { data: childRows, error: childError } = componentIds.length
    ? await supabase
        .from("grading_periods")
        .select("id,code,name,calculation_mode,period_role,sort_order")
        .eq("offering_id", scope.offeringId)
        .in("id", componentIds)
    : { data: [] as PeriodRow[], error: null };
  if (childError || !childRows) return null;
  const childById = new Map((childRows as PeriodRow[]).map((row) => [row.id, normalizePeriod(row)]));
  const components: { weight: number; calculation: StudentPeriodCalculation }[] = [];
  for (const componentRow of componentRows as ComponentRow[]) {
    const child = childById.get(componentRow.component_period_id);
    if (!child) continue;
    const calculation = await getStudentPeriodCalculation(sectionId, studentId, child.code, options, [...stack, gradingPeriodCode]);
    if (!calculation) continue;
    components.push({ weight: Number(componentRow.weight), calculation });
  }
  const result = calculateSemesterGrade(components.map(({ weight, calculation }) => ({
    code: calculation.gradingPeriod.code,
    label: calculation.gradingPeriod.name,
    role: calculation.gradingPeriod.periodRole,
    weight,
    percent: overallPercent(calculation),
  })));
  return { mode: "composite", studentId, sectionId, gradingPeriod: period, rules: categoryRules.rules, components, result };
}

export async function getStudentGradeCalculation(
  sectionId: string,
  studentId: string,
  gradingPeriodCode: string,
  options?: CalculationOptions,
): Promise<StudentGradeCalculation | null> {
  const calculation = await getStudentPeriodCalculation(sectionId, studentId, gradingPeriodCode, options);
  return calculation?.mode === "direct" ? calculation : null;
}

export async function getStudentSemesterCalculation(
  sectionId: string,
  studentId: string,
  semesterCode: "S1" | "S2",
  options?: CalculationOptions,
): Promise<StudentSemesterCalculation> {
  const calculation = await getStudentPeriodCalculation(sectionId, studentId, semesterCode, options);
  if (!calculation || calculation.mode !== "composite") {
    return {
      studentId,
      sectionId,
      semesterCode,
      semesterName: semesterCode,
      quarterCalculations: [],
      examCalculation: null,
      result: calculateSemesterGrade([]),
    };
  }
  const directComponents = calculation.components
    .map((component) => component.calculation)
    .filter((component): component is Extract<StudentPeriodCalculation, { mode: "direct" }> => component.mode === "direct");
  const examCalculation = directComponents.find((component) => component.gradingPeriod.periodRole === "exam") ?? null;
  const quarterCalculations = directComponents.filter((component) => component.gradingPeriod.periodRole !== "exam");
  return {
    studentId,
    sectionId,
    semesterCode,
    semesterName: calculation.gradingPeriod.name,
    quarterCalculations,
    examCalculation,
    result: calculation.result,
  };
}

export async function getSectionGradebook(
  sectionId: string,
  studentIds: string[],
  gradingPeriodCode: string,
  options?: CalculationOptions,
): Promise<SectionGradebookCalculation | null> {
  const scope = await getCourseOfferingForSection(sectionId);
  if (!scope) return null;
  const supabase = await createClient();
  const [{ data: periodRows, error: periodsError }, { data: componentRows, error: componentsError }, categoryRules] = await Promise.all([
    supabase
      .from("grading_periods")
      .select("id,code,name,calculation_mode,period_role,sort_order")
      .eq("offering_id", scope.offeringId),
    supabase
      .from("grading_period_components")
      .select("parent_period_id,component_period_id,weight,sort_order"),
    loadCategoryRules(sectionId, options),
  ]);
  if (periodsError || componentsError || !periodRows || !componentRows || !categoryRules) return null;
  const periods = (periodRows as PeriodRow[]).map(normalizePeriod);
  const periodById = new Map(periods.map((period) => [period.id, period]));
  const periodByCode = new Map(periods.map((period) => [period.code, period]));
  const selectedPeriod = periodByCode.get(gradingPeriodCode);
  if (!selectedPeriod) return null;
  const componentsByParent = new Map<string, ComponentRow[]>();
  for (const row of componentRows as ComponentRow[]) {
    if (!periodById.has(row.parent_period_id) || !periodById.has(row.component_period_id)) continue;
    const list = componentsByParent.get(row.parent_period_id) ?? [];
    list.push(row);
    componentsByParent.set(row.parent_period_id, list);
  }
  for (const list of componentsByParent.values()) list.sort((a, b) => Number(a.sort_order) - Number(b.sort_order));

  function collectDirectPeriodIds(periodId: string, stack: string[] = []): string[] {
    if (stack.includes(periodId)) throw new Error("Circular grading-period composition detected.");
    const period = periodById.get(periodId);
    if (!period) return [];
    if (period.calculationMode === "direct") return [periodId];
    return (componentsByParent.get(periodId) ?? []).flatMap((component) => collectDirectPeriodIds(component.component_period_id, [...stack, periodId]));
  }

  const directPeriodIds = Array.from(new Set(collectDirectPeriodIds(selectedPeriod.id)));
  const { categoryById, rules } = categoryRules;
  if (directPeriodIds.length === 0) {
    return {
      sectionId,
      gradingPeriod: selectedPeriod,
      mode: selectedPeriod.calculationMode,
      rules,
      rows: studentIds.map((studentId) => ({ studentId, overallPercent: null, categoryPercents: {}, componentPercents: {}, missingCount: 0, unenteredCount: 0, assignmentCount: 0 })),
    };
  }

  const { data: assignments, error: assignmentsError } = await supabase
    .from("assignments")
    .select("id,category_id,grading_period_id,title,assignment_date,points_possible,created_at")
    .eq("section_id", sectionId)
    .eq("archived", false)
    .in("grading_period_id", directPeriodIds)
    .order("assignment_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (assignmentsError || !assignments) return null;
  const assignmentIds = assignments.map((assignment) => assignment.id);
  let gradeRows: { id: string; assignment_id: string; student_id: string; missing: boolean; exempt: boolean }[] = [];
  if (studentIds.length > 0 && assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from("grade_records")
      .select("id,assignment_id,student_id,missing,exempt")
      .in("student_id", studentIds)
      .in("assignment_id", assignmentIds);
    if (error || !data) return null;
    gradeRows = data;
  }
  const gradeRecordIds = gradeRows.map((row) => row.id);
  let attempts: { id: string; grade_record_id: string; points_earned: number; attempt_number: number; occurred_on: string }[] = [];
  if (gradeRecordIds.length > 0) {
    const { data, error } = await supabase
      .from("grade_attempts")
      .select("id,grade_record_id,points_earned,attempt_number,occurred_on")
      .in("grade_record_id", gradeRecordIds)
      .order("attempt_number", { ascending: true });
    if (error || !data) return null;
    attempts = data;
  }

  const assignmentsByPeriodId = new Map<string, typeof assignments>();
  for (const assignment of assignments) {
    if (!assignment.grading_period_id) continue;
    const list = assignmentsByPeriodId.get(assignment.grading_period_id) ?? [];
    list.push(assignment);
    assignmentsByPeriodId.set(assignment.grading_period_id, list);
  }
  const gradeRowByStudentAssignment = new Map<string, (typeof gradeRows)[number]>();
  for (const row of gradeRows) gradeRowByStudentAssignment.set(`${row.student_id}:${row.assignment_id}`, row);
  const attemptsByGradeRecordId = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const list = attemptsByGradeRecordId.get(attempt.grade_record_id) ?? [];
    list.push(attempt);
    attemptsByGradeRecordId.set(attempt.grade_record_id, list);
  }

  function calculateDirect(studentId: string, periodId: string) {
    const period = periodById.get(periodId);
    const periodAssignments = assignmentsByPeriodId.get(periodId) ?? [];
    if (!period) return { result: calculateGrade([], rules), assignmentCount: 0 };
    const records: GradeRecord[] = periodAssignments.map((assignment) => {
      const config = categoryById.get(assignment.category_id);
      if (!config) throw new Error(`Assignment ${assignment.id} references an unknown grading category.`);
      const row = gradeRowByStudentAssignment.get(`${studentId}:${assignment.id}`);
      const rowAttempts = row ? attemptsByGradeRecordId.get(row.id) ?? [] : [];
      const possible = Number(assignment.points_possible);
      return {
        assignmentId: assignment.id,
        assignmentTitle: assignment.title,
        assignmentDate: assignment.assignment_date,
        gradingPeriodCode: period.code,
        category: config.category,
        pointsPossible: possible,
        missing: row?.missing ?? false,
        exempt: row?.exempt ?? false,
        attempts: rowAttempts.map((attempt) => ({
          id: attempt.id,
          earned: Number(attempt.points_earned),
          possible,
          attemptNumber: attempt.attempt_number,
          occurredAt: attempt.occurred_on,
        })),
      };
    });
    return { result: calculateGrade(records, rules), assignmentCount: periodAssignments.length };
  }

  type BulkPeriodResult = {
    overallPercent: number | null;
    categoryPercents: Record<GradingCategory, number>;
    componentPercents: Record<string, number | null>;
    audit: GradeAuditLine[];
    assignmentCount: number;
  };

  function calculatePeriod(studentId: string, periodId: string, stack: string[] = []): BulkPeriodResult {
    if (stack.includes(periodId)) throw new Error("Circular grading-period composition detected.");
    const period = periodById.get(periodId);
    if (!period) return { overallPercent: null, categoryPercents: {}, componentPercents: {}, audit: [], assignmentCount: 0 };
    if (period.calculationMode === "direct") {
      const direct = calculateDirect(studentId, periodId);
      return {
        overallPercent: direct.result.overallPercent,
        categoryPercents: direct.result.categoryPercents,
        componentPercents: {},
        audit: direct.result.audit,
        assignmentCount: direct.assignmentCount,
      };
    }
    const childResults = (componentsByParent.get(periodId) ?? []).map((component) => {
      const child = periodById.get(component.component_period_id);
      const calculation = calculatePeriod(studentId, component.component_period_id, [...stack, periodId]);
      return { component, child, calculation };
    }).filter((entry) => Boolean(entry.child));
    const composite = calculateSemesterGrade(childResults.map(({ component, child, calculation }) => ({
      code: child!.code,
      label: child!.name,
      role: child!.periodRole,
      weight: Number(component.weight),
      percent: calculation.overallPercent,
    })));
    return {
      overallPercent: composite.overallPercent,
      categoryPercents: {},
      componentPercents: Object.fromEntries(childResults.map(({ child, calculation }) => [child!.code, calculation.overallPercent])),
      audit: childResults.flatMap(({ calculation }) => calculation.audit),
      assignmentCount: childResults.reduce((sum, { calculation }) => sum + calculation.assignmentCount, 0),
    };
  }

  const rows = studentIds.map((studentId): SectionGradebookRow => {
    const calculation = calculatePeriod(studentId, selectedPeriod.id);
    return {
      studentId,
      overallPercent: calculation.overallPercent,
      categoryPercents: calculation.categoryPercents,
      componentPercents: calculation.componentPercents,
      missingCount: calculation.audit.filter((line) => line.status === "missing").length,
      unenteredCount: calculation.audit.filter((line) => line.status === "unentered").length,
      assignmentCount: calculation.assignmentCount,
    };
  });
  return { sectionId, gradingPeriod: selectedPeriod, mode: selectedPeriod.calculationMode, rules, rows };
}
