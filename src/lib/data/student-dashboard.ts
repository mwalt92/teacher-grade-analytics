import { getSectionGradingPeriods, getStudentGradeCalculation, getStudentSemesterCalculation } from "@/lib/data/grade-calculation";
import type { GradingCategory } from "@/lib/grading/types";

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
  percent: number | null;
  attemptCount: number;
  countedAttemptNumber: number | null;
  attempts: { attemptNumber: number; earned: number; possible: number; percent: number; counted: boolean }[];
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

  return {
    quarterCode: selectedQuarter.code,
    quarterName: selectedQuarter.name,
    quarterPercent: quarterCalculation.result.overallPercent,
    semesterCode,
    semesterPercent: semesterCalculation.result.overallPercent,
    semesterActiveWeight: semesterCalculation.result.activeWeight,
    categories,
    assignments,
    missingCount: assignments.filter((assignment) => assignment.status === "missing").length,
    droppedCount: assignments.filter((assignment) => assignment.status === "dropped").length,
    availableQuarterCodes: quarters.map((quarter) => ({ code: quarter.code, name: quarter.name })),
  };
}
