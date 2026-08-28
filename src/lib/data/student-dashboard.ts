import { getSectionGradingPeriods, getStudentGradeCalculation, getStudentPeriodCalculation } from "@/lib/data/grade-calculation";
import type { CategoryCalculationMethod, GradeRecord, GradingCategory, GradingRules, SemesterComponent } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";

export type StudentDashboardCategory = {
  category: GradingCategory;
  label: string;
  calculationMethod: CategoryCalculationMethod;
  averagePercent: number;
  configuredWeight: number;
  assignmentCount: number;
  droppedCount: number;
  pointsEarned: number;
  pointsPossible: number;
};

export type StudentDashboardAssignment = {
  assignmentId: string;
  title: string;
  date: string | null;
  category: GradingCategory;
  status: "counted" | "dropped" | "missing" | "unentered" | "exempt";
  missing: boolean;
  dropped: boolean;
  percent: number | null;
  attemptCount: number;
  countedAttemptNumber: number | null;
  attempts: { attemptNumber: number; earned: number; possible: number; percent: number; counted: boolean }[];
};

export type GradeSimulatorRetakeOption = {
  assignmentId: string;
  title: string;
  category: GradingCategory;
  pointsPossible: number;
  currentBestPercent: number | null;
  nextAttemptNumber: number;
};

export type GradeSimulatorData = {
  periodCode: string;
  currentPeriodPercent: number | null;
  summaryPeriodCode: string;
  summaryPeriodName: string;
  currentSummaryPercent: number | null;
  rules: GradingRules;
  lateDeductions: Record<GradingCategory, number>;
  records: GradeRecord[];
  retakeOptions: GradeSimulatorRetakeOption[];
  summaryComponents: SemesterComponent[];
};

export type StudentDashboardData = {
  periodCode: string;
  periodName: string;
  periodPercent: number | null;
  summaryPeriodCode: string;
  summaryPeriodName: string;
  summaryPercent: number | null;
  summaryActiveWeight: number;
  categories: StudentDashboardCategory[];
  assignments: StudentDashboardAssignment[];
  missingCount: number;
  droppedCount: number;
  availablePeriods: { code: string; name: string }[];
  simulator: GradeSimulatorData;
};

export async function getStudentDashboardData(
  sectionId: string,
  studentId: string,
  requestedPeriod?: string,
): Promise<StudentDashboardData | null> {
  const periods = await getSectionGradingPeriods(sectionId);
  const reviewPeriods = periods.filter((period) => period.calculationMode === "direct" && period.periodRole === "standard");
  if (!reviewPeriods.length) return null;
  const selectedPeriod = reviewPeriods.find((period) => period.code === requestedPeriod) ?? reviewPeriods[0];
  const supabase = await createClient();
  const { data: parentRows } = await supabase
    .from("grading_period_components")
    .select("parent_period_id")
    .eq("component_period_id", selectedPeriod.id);
  const parentIds = new Set((parentRows ?? []).map((row) => row.parent_period_id));
  const summaryPeriod = periods.find((period) => parentIds.has(period.id) && period.calculationMode === "composite") ?? selectedPeriod;

  const [periodCalculation, summaryCalculation] = await Promise.all([
    getStudentGradeCalculation(sectionId, studentId, selectedPeriod.code),
    summaryPeriod.id === selectedPeriod.id
      ? getStudentPeriodCalculation(sectionId, studentId, selectedPeriod.code)
      : getStudentPeriodCalculation(sectionId, studentId, summaryPeriod.code),
  ]);
  if (!periodCalculation || !summaryCalculation) return null;

  const categories = Object.values(periodCalculation.result.categories)
    .filter((category): category is NonNullable<typeof category> => Boolean(category))
    .map((category) => ({
      category: category.category,
      label: category.label,
      calculationMethod: category.calculationMethod,
      averagePercent: category.averagePercent,
      configuredWeight: category.configuredWeight,
      assignmentCount: category.assignmentCount,
      droppedCount: category.droppedCount,
      pointsEarned: category.pointsEarned,
      pointsPossible: category.pointsPossible,
    }));

  const assignments = periodCalculation.result.audit
    .map((line) => ({
      assignmentId: line.assignmentId,
      title: line.assignmentTitle ?? "Assignment",
      date: line.assignmentDate ?? null,
      category: line.category,
      status: line.status,
      missing: line.missing,
      dropped: line.dropped,
      percent: line.percent,
      attemptCount: line.attempts.length,
      countedAttemptNumber: line.countedAttemptNumber,
      attempts: line.attempts.map((attempt) => ({
        attemptNumber: attempt.attemptNumber,
        earned: attempt.earned,
        possible: attempt.possible,
        percent: attempt.percent,
        counted: attempt.counted,
      })),
    }))
    .sort((a, b) => (b.date ?? "").localeCompare(a.date ?? ""));

  const simulatorRecords: GradeRecord[] = periodCalculation.result.audit.map((line) => ({
    assignmentId: line.assignmentId,
    assignmentTitle: line.assignmentTitle,
    assignmentDate: line.assignmentDate,
    gradingPeriodCode: line.gradingPeriodCode ?? selectedPeriod.code,
    category: line.category,
    pointsPossible: line.pointsPossible,
    missing: line.missing,
    exempt: line.exempt,
    attempts: line.attempts.map((attempt) => ({
      id: attempt.attemptId,
      earned: attempt.earned,
      possible: attempt.possible,
      attemptNumber: attempt.attemptNumber,
      occurredAt: line.assignmentDate ?? selectedPeriod.code,
    })),
  }));

  const assignmentIds = periodCalculation.result.audit.map((line) => line.assignmentId);
  const { data: lateRows } = await supabase
    .from("grading_categories")
    .select("code,late_deduction")
    .eq("section_id", sectionId);
  const lateDeductions: Record<GradingCategory, number> = {};
  for (const row of lateRows ?? []) lateDeductions[row.code] = Number(row.late_deduction) || 0;

  let retakeRows: { id: string; title: string; allow_retakes: boolean; points_possible: number | string }[] = [];
  if (assignmentIds.length > 0) {
    const { data } = await supabase
      .from("assignments")
      .select("id,title,allow_retakes,points_possible")
      .eq("section_id", sectionId)
      .eq("archived", false)
      .eq("allow_retakes", true)
      .in("id", assignmentIds);
    retakeRows = data ?? [];
  }
  const auditByAssignmentId = new Map(periodCalculation.result.audit.map((line) => [line.assignmentId, line]));
  const retakeOptions: GradeSimulatorRetakeOption[] = retakeRows.flatMap((row) => {
    const line = auditByAssignmentId.get(row.id);
    if (!line || line.exempt || line.attempts.length === 0) return [];
    const nextAttemptNumber = Math.max(...line.attempts.map((attempt) => attempt.attemptNumber)) + 1;
    return [{
      assignmentId: row.id,
      title: row.title,
      category: line.category,
      pointsPossible: Number(row.points_possible),
      currentBestPercent: line.percent,
      nextAttemptNumber,
    }];
  }).sort((a, b) => a.title.localeCompare(b.title));

  const summaryComponents: SemesterComponent[] = summaryCalculation.mode === "composite"
    ? summaryCalculation.result.components.map((component) => ({
        code: component.code,
        label: component.label,
        role: component.role,
        weight: component.weight,
        percent: component.percent,
      }))
    : [{
        code: selectedPeriod.code,
        label: selectedPeriod.name,
        role: selectedPeriod.periodRole,
        weight: 1,
        percent: periodCalculation.result.overallPercent,
      }];

  return {
    periodCode: selectedPeriod.code,
    periodName: selectedPeriod.name,
    periodPercent: periodCalculation.result.overallPercent,
    summaryPeriodCode: summaryPeriod.code,
    summaryPeriodName: summaryPeriod.name,
    summaryPercent: summaryCalculation.result.overallPercent,
    summaryActiveWeight: summaryCalculation.result.activeWeight,
    categories,
    assignments,
    missingCount: assignments.filter((assignment) => assignment.missing).length,
    droppedCount: assignments.filter((assignment) => assignment.dropped).length,
    availablePeriods: reviewPeriods.map((period) => ({ code: period.code, name: period.name })),
    simulator: {
      periodCode: selectedPeriod.code,
      currentPeriodPercent: periodCalculation.result.overallPercent,
      summaryPeriodCode: summaryPeriod.code,
      summaryPeriodName: summaryPeriod.name,
      currentSummaryPercent: summaryCalculation.result.overallPercent,
      rules: periodCalculation.rules,
      lateDeductions,
      records: simulatorRecords,
      retakeOptions,
      summaryComponents,
    },
  };
}
