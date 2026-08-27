import { getSectionGradingPeriods, getStudentGradeCalculation, getStudentSemesterCalculation, gradingCategoryFromName } from "@/lib/data/grade-calculation";
import type { GradeRecord, GradingCategory, GradingRules, SemesterComponent } from "@/lib/grading/types";
import { createClient } from "@/lib/supabase/server";

export type StudentDashboardCategory = {
  category: GradingCategory;
  averagePercent: number;
  configuredWeight: number;
  assignmentCount: number;
  droppedCount: number;
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

export type GradeSimulatorData = {
  quarterCode: string;
  currentQuarterPercent: number | null;
  semesterCode: "S1" | "S2";
  currentSemesterPercent: number | null;
  rules: GradingRules;
  lateDeductions: Record<GradingCategory, number>;
  records: GradeRecord[];
  semesterComponents: SemesterComponent[];
};

export type StudentDashboardData = {
  quarterCode: string;
  quarterName: string;
  quarterPercent: number | null;
  semesterCode: "S1" | "S2";
  semesterPercent: number | null;
  semesterActiveWeight: number;
  categories: StudentDashboardCategory[];
  assignments: StudentDashboardAssignment[];
  missingCount: number;
  droppedCount: number;
  availableQuarterCodes: { code: string; name: string }[];
  simulator: GradeSimulatorData;
};

function semesterForQuarter(code: string): "S1" | "S2" {
  return code === "Q3" || code === "Q4" ? "S2" : "S1";
}

export async function getStudentDashboardData(
  sectionId: string,
  studentId: string,
  requestedQuarter?: string,
): Promise<StudentDashboardData | null> {
  const periods = await getSectionGradingPeriods(sectionId);
  const quarters = periods.filter((period) => /^Q[1-4]$/.test(period.code));
  if (!quarters.length) return null;
  const selectedQuarter = quarters.find((period) => period.code === requestedQuarter) ?? quarters[0];
  const semesterCode = semesterForQuarter(selectedQuarter.code);

  const [quarterCalculation, semesterCalculation] = await Promise.all([
    getStudentGradeCalculation(sectionId, studentId, selectedQuarter.code),
    getStudentSemesterCalculation(sectionId, studentId, semesterCode),
  ]);
  if (!quarterCalculation) return null;

  const categories = Object.values(quarterCalculation.result.categories)
    .filter((category): category is NonNullable<typeof category> => Boolean(category))
    .map((category) => ({
      category: category.category,
      averagePercent: category.averagePercent,
      configuredWeight: category.configuredWeight,
      assignmentCount: category.assignmentCount,
      droppedCount: category.droppedCount,
    }));

  const assignments = quarterCalculation.result.audit
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

  const simulatorRecords: GradeRecord[] = quarterCalculation.result.audit.map((line) => ({
    assignmentId: line.assignmentId,
    assignmentTitle: line.assignmentTitle,
    assignmentDate: line.assignmentDate,
    gradingPeriodCode: line.gradingPeriodCode ?? selectedQuarter.code,
    category: line.category,
    missing: line.missing,
    exempt: line.exempt,
    attempts: line.attempts.map((attempt) => ({
      id: attempt.attemptId,
      earned: attempt.earned,
      possible: attempt.possible,
      attemptNumber: attempt.attemptNumber,
      occurredAt: line.assignmentDate ?? selectedQuarter.code,
    })),
  }));

  const lateDeductions: Record<GradingCategory, number> = { participation: 0, quiz: 0, test: 0 };
  const supabase = await createClient();
  const { data: lateRows } = await supabase
    .from("grading_categories")
    .select("name,late_deduction")
    .eq("section_id", sectionId);
  for (const row of lateRows ?? []) {
    try {
      lateDeductions[gradingCategoryFromName(row.name)] = Number(row.late_deduction) || 0;
    } catch {
      // Ignore unsupported future categories until the grading engine knows how to calculate them.
    }
  }

  return {
    quarterCode: selectedQuarter.code,
    quarterName: selectedQuarter.name,
    quarterPercent: quarterCalculation.result.overallPercent,
    semesterCode,
    semesterPercent: semesterCalculation.result.overallPercent,
    semesterActiveWeight: semesterCalculation.result.activeWeight,
    categories,
    assignments,
    missingCount: assignments.filter((assignment) => assignment.missing).length,
    droppedCount: assignments.filter((assignment) => assignment.dropped).length,
    availableQuarterCodes: quarters.map((quarter) => ({ code: quarter.code, name: quarter.name })),
    simulator: {
      quarterCode: selectedQuarter.code,
      currentQuarterPercent: quarterCalculation.result.overallPercent,
      semesterCode,
      currentSemesterPercent: semesterCalculation.result.overallPercent,
      rules: quarterCalculation.rules,
      lateDeductions,
      records: simulatorRecords,
      semesterComponents: semesterCalculation.result.components.map((component) => ({
        code: component.code,
        label: component.label,
        weight: component.weight,
        percent: component.percent,
      })),
    },
  };
}
