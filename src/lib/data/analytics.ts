import { getSectionGradebook, getSectionGradingPeriods, type GradingPeriodSummary, type SectionGradebookRow } from "@/lib/data/grade-calculation";
import { getSectionRoster } from "@/lib/data/roster";
import type { TeacherSectionSummary } from "@/lib/data/teacher-context";

export type AnalyticsGradeBand = {
  key: "a" | "b" | "c" | "d" | "f";
  label: string;
  count: number;
};

export type AnalyticsSeries = {
  key: string;
  label: string;
  average: number | null;
  studentCount: number;
};

export type AnalyticsStudentRow = {
  studentId: string;
  displayName: string;
  overallPercent: number | null;
  missingCount: number;
  unenteredCount: number;
  categoryPercents: Record<string, number>;
  componentPercents: Record<string, number | null>;
};

export type SectionAnalyticsData = {
  sectionId: string;
  selectedPeriod: GradingPeriodSummary | null;
  periods: GradingPeriodSummary[];
  studentCount: number;
  gradedCount: number;
  assignmentCount: number;
  classAverage: number | null;
  median: number | null;
  missingCount: number;
  unenteredCount: number;
  gradeBands: AnalyticsGradeBand[];
  categories: AnalyticsSeries[];
  components: AnalyticsSeries[];
  students: AnalyticsStudentRow[];
};

export type OfferingAnalyticsStudentRow = AnalyticsStudentRow & {
  sectionId: string;
  sectionName: string;
  periodNumber: number | null;
};

export type OfferingAnalyticsSection = {
  sectionId: string;
  sectionName: string;
  periodNumber: number | null;
  studentCount: number;
  gradedCount: number;
  assignmentCount: number;
  classAverage: number | null;
  median: number | null;
  missingCount: number;
  unenteredCount: number;
};

export type OfferingAnalyticsData = {
  selectedPeriod: GradingPeriodSummary | null;
  periods: GradingPeriodSummary[];
  sectionCount: number;
  studentCount: number;
  gradedCount: number;
  assignmentCount: number;
  classAverage: number | null;
  median: number | null;
  missingCount: number;
  unenteredCount: number;
  gradeBands: AnalyticsGradeBand[];
  categories: AnalyticsSeries[];
  components: AnalyticsSeries[];
  sections: OfferingAnalyticsSection[];
  students: OfferingAnalyticsStudentRow[];
};

const GRADE_BANDS: { key: AnalyticsGradeBand["key"]; label: string; test: (value: number) => boolean }[] = [
  { key: "a", label: "A • 90–100", test: (value) => value >= 90 },
  { key: "b", label: "B • 80–89.9", test: (value) => value >= 80 && value < 90 },
  { key: "c", label: "C • 70–79.9", test: (value) => value >= 70 && value < 80 },
  { key: "d", label: "D • 60–69.9", test: (value) => value >= 60 && value < 70 },
  { key: "f", label: "F • below 60", test: (value) => value < 60 },
];

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const midpoint = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[midpoint] : (sorted[midpoint - 1] + sorted[midpoint]) / 2;
}

function gradeBands(values: number[]): AnalyticsGradeBand[] {
  return GRADE_BANDS.map((band) => ({
    key: band.key,
    label: band.label,
    count: values.filter(band.test).length,
  }));
}

function seriesFromRows(
  rows: { values: Record<string, number | null | undefined> }[],
  keys: string[],
  labels: Map<string, string>,
): AnalyticsSeries[] {
  return keys.map((key) => {
    const values = rows
      .map((row) => row.values[key])
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
    return {
      key,
      label: labels.get(key) ?? key,
      average: average(values),
      studentCount: values.length,
    };
  });
}

function configuredCategoryKeys(rows: SectionGradebookRow[], labels: Map<string, string>) {
  const keys = new Set(labels.keys());
  for (const row of rows) for (const key of Object.keys(row.categoryPercents)) keys.add(key);
  return [...keys];
}

function configuredComponentKeys(rows: SectionGradebookRow[], periods: GradingPeriodSummary[]) {
  const keys = new Set<string>();
  for (const row of rows) for (const key of Object.keys(row.componentPercents)) keys.add(key);
  const order = new Map(periods.map((period, index) => [period.code, index]));
  return [...keys].sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b));
}

function sortStudents<T extends AnalyticsStudentRow>(students: T[]) {
  return students.sort((a, b) => {
    if (a.overallPercent === null && b.overallPercent !== null) return 1;
    if (a.overallPercent !== null && b.overallPercent === null) return -1;
    if (a.overallPercent !== null && b.overallPercent !== null && a.overallPercent !== b.overallPercent) return a.overallPercent - b.overallPercent;
    return a.displayName.localeCompare(b.displayName);
  });
}

export async function getSectionAnalyticsData(sectionId: string, requestedPeriod?: string): Promise<SectionAnalyticsData> {
  const [roster, periods] = await Promise.all([
    getSectionRoster(sectionId, "active"),
    getSectionGradingPeriods(sectionId),
  ]);
  const selectablePeriods = periods.filter((period) => period.periodRole !== "exam");
  const selectedPeriod = selectablePeriods.find((period) => period.code === requestedPeriod) ?? selectablePeriods[0] ?? null;
  const studentIds = roster.map((student) => student.studentId);
  const gradebook = selectedPeriod ? await getSectionGradebook(sectionId, studentIds, selectedPeriod.code) : null;
  const rows = gradebook?.rows ?? [];
  const rowByStudent = new Map(rows.map((row) => [row.studentId, row]));
  const gradedValues = rows.map((row) => row.overallPercent).filter((value): value is number => value !== null);
  const categoryLabels = new Map<string, string>();
  if (gradebook) {
    for (const key of Object.keys(gradebook.rules.categoryWeights)) {
      categoryLabels.set(key, gradebook.rules.categoryLabels?.[key] ?? key);
    }
  }
  const periodLabels = new Map(periods.map((period) => [period.code, `${period.code} — ${period.name}`]));
  const categoryKeys = configuredCategoryKeys(rows, categoryLabels);
  const componentKeys = configuredComponentKeys(rows, periods);
  const categories = seriesFromRows(rows.map((row) => ({ values: row.categoryPercents })), categoryKeys, categoryLabels);
  const components = seriesFromRows(rows.map((row) => ({ values: row.componentPercents })), componentKeys, periodLabels);
  const students = sortStudents(roster.map((student): AnalyticsStudentRow => {
    const row = rowByStudent.get(student.studentId);
    return {
      studentId: student.studentId,
      displayName: student.displayName,
      overallPercent: row?.overallPercent ?? null,
      missingCount: row?.missingCount ?? 0,
      unenteredCount: row?.unenteredCount ?? 0,
      categoryPercents: row?.categoryPercents ?? {},
      componentPercents: row?.componentPercents ?? {},
    };
  }));
  return {
    sectionId,
    selectedPeriod,
    periods: selectablePeriods,
    studentCount: roster.length,
    gradedCount: gradedValues.length,
    assignmentCount: rows.reduce((max, row) => Math.max(max, row.assignmentCount), 0),
    classAverage: average(gradedValues),
    median: median(gradedValues),
    missingCount: rows.reduce((sum, row) => sum + row.missingCount, 0),
    unenteredCount: rows.reduce((sum, row) => sum + row.unenteredCount, 0),
    gradeBands: gradeBands(gradedValues),
    categories,
    components,
    students,
  };
}

export async function getOfferingAnalyticsData(
  sections: TeacherSectionSummary[],
  requestedPeriod?: string,
): Promise<OfferingAnalyticsData> {
  const sectionData = await Promise.all(sections.map(async (section) => ({
    section,
    analytics: await getSectionAnalyticsData(section.sectionId, requestedPeriod),
  })));
  const students = sortStudents(sectionData.flatMap(({ section, analytics }) => analytics.students.map((student): OfferingAnalyticsStudentRow => ({
    ...student,
    sectionId: section.sectionId,
    sectionName: section.sectionName,
    periodNumber: section.periodNumber,
  }))));
  const gradedValues = students.map((student) => student.overallPercent).filter((value): value is number => value !== null);
  const categoryLabels = new Map<string, string>();
  const categoryKeys = new Set<string>();
  const componentLabels = new Map<string, string>();
  const componentKeys = new Set<string>();
  for (const { analytics } of sectionData) {
    for (const category of analytics.categories) {
      categoryKeys.add(category.key);
      categoryLabels.set(category.key, category.label);
    }
    for (const component of analytics.components) {
      componentKeys.add(component.key);
      componentLabels.set(component.key, component.label);
    }
  }
  const firstPeriods = sectionData[0]?.analytics.periods ?? [];
  const periodOrder = new Map(firstPeriods.map((period, index) => [period.code, index]));
  const orderedComponentKeys = [...componentKeys].sort((a, b) => (periodOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (periodOrder.get(b) ?? Number.MAX_SAFE_INTEGER) || a.localeCompare(b));
  const categories = seriesFromRows(students.map((student) => ({ values: student.categoryPercents })), [...categoryKeys], categoryLabels);
  const components = seriesFromRows(students.map((student) => ({ values: student.componentPercents })), orderedComponentKeys, componentLabels);
  return {
    selectedPeriod: sectionData[0]?.analytics.selectedPeriod ?? null,
    periods: firstPeriods,
    sectionCount: sections.length,
    studentCount: students.length,
    gradedCount: gradedValues.length,
    assignmentCount: sectionData.reduce((max, item) => Math.max(max, item.analytics.assignmentCount), 0),
    classAverage: average(gradedValues),
    median: median(gradedValues),
    missingCount: students.reduce((sum, student) => sum + student.missingCount, 0),
    unenteredCount: students.reduce((sum, student) => sum + student.unenteredCount, 0),
    gradeBands: gradeBands(gradedValues),
    categories,
    components,
    sections: sectionData.map(({ section, analytics }) => ({
      sectionId: section.sectionId,
      sectionName: section.sectionName,
      periodNumber: section.periodNumber,
      studentCount: analytics.studentCount,
      gradedCount: analytics.gradedCount,
      assignmentCount: analytics.assignmentCount,
      classAverage: analytics.classAverage,
      median: analytics.median,
      missingCount: analytics.missingCount,
      unenteredCount: analytics.unenteredCount,
    })),
    students,
  };
}
