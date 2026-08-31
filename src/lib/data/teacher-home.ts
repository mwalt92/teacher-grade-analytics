import { getTeacherDashboardData, getTeacherOfferingDashboardData } from "@/lib/data/dashboard";
import type { TeacherSectionSummary } from "@/lib/data/teacher-context";

export type TeacherHomeSection = {
  sectionId: string;
  sectionName: string;
  periodNumber: number | null;
  sortOrder: number;
};

export type TeacherHomeCourse = {
  offeringId: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearLabel: string;
  sections: TeacherHomeSection[];
  selectedPeriod: { code: string; name: string } | null;
  studentCount: number;
  gradedStudentCount: number;
  classAverage: number | null;
  missingCount: number;
  retakeCount: number;
  powerSchoolMismatchCount: number;
  attentionCount: number;
  recentWorkTitle: string | null;
  recentWorkDate: string | null;
};

export type TeacherHomeData = {
  courses: TeacherHomeCourse[];
  courseCount: number;
  sectionCount: number;
  activeEnrollmentCount: number;
  missingCount: number;
  retakeCount: number;
  powerSchoolMismatchCount: number;
};

function sortSections(a: TeacherSectionSummary, b: TeacherSectionSummary) {
  return (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
    || a.sortOrder - b.sortOrder
    || a.sectionName.localeCompare(b.sectionName);
}

export async function getTeacherHomeData(sections: TeacherSectionSummary[]): Promise<TeacherHomeData> {
  const byOffering = new Map<string, TeacherSectionSummary[]>();
  for (const section of sections) {
    const list = byOffering.get(section.offeringId) ?? [];
    list.push(section);
    byOffering.set(section.offeringId, list);
  }

  const courseGroups = [...byOffering.values()]
    .map((group) => [...group].sort(sortSections))
    .sort((a, b) =>
      (b[0]?.schoolYearLabel ?? "").localeCompare(a[0]?.schoolYearLabel ?? "")
      || (a[0]?.courseName ?? "").localeCompare(b[0]?.courseName ?? ""));

  const courses = await Promise.all(courseGroups.map(async (group): Promise<TeacherHomeCourse> => {
    const first = group[0];
    if (!first) throw new Error("Course offering has no sections.");

    if (group.length === 1) {
      const dashboard = await getTeacherDashboardData(first.sectionId);
      const recent = dashboard.recentAssignments[0] ?? null;
      return {
        offeringId: first.offeringId,
        courseId: first.courseId,
        courseName: first.courseName,
        courseCode: first.courseCode,
        schoolYearLabel: first.schoolYearLabel,
        sections: group.map((section) => ({
          sectionId: section.sectionId,
          sectionName: section.sectionName,
          periodNumber: section.periodNumber,
          sortOrder: section.sortOrder,
        })),
        selectedPeriod: dashboard.selectedPeriod ? { code: dashboard.selectedPeriod.code, name: dashboard.selectedPeriod.name } : null,
        studentCount: dashboard.studentCount,
        gradedStudentCount: dashboard.gradedStudentCount,
        classAverage: dashboard.classAverage,
        missingCount: dashboard.missingCount,
        retakeCount: dashboard.retakeCount,
        powerSchoolMismatchCount: dashboard.powerSchoolMismatchCount,
        attentionCount: dashboard.attentionStudents.length,
        recentWorkTitle: recent?.title ?? null,
        recentWorkDate: recent?.date ?? null,
      };
    }

    const dashboard = await getTeacherOfferingDashboardData(group);
    const recent = dashboard.recentAssignments[0] ?? null;
    return {
      offeringId: first.offeringId,
      courseId: first.courseId,
      courseName: first.courseName,
      courseCode: first.courseCode,
      schoolYearLabel: first.schoolYearLabel,
      sections: group.map((section) => ({
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        periodNumber: section.periodNumber,
        sortOrder: section.sortOrder,
      })),
      selectedPeriod: dashboard.selectedPeriod ? { code: dashboard.selectedPeriod.code, name: dashboard.selectedPeriod.name } : null,
      studentCount: dashboard.studentCount,
      gradedStudentCount: dashboard.gradedStudentCount,
      classAverage: dashboard.classAverage,
      missingCount: dashboard.missingCount,
      retakeCount: dashboard.retakeCount,
      powerSchoolMismatchCount: dashboard.powerSchoolMismatchCount,
      attentionCount: dashboard.attentionStudents.length,
      recentWorkTitle: recent?.title ?? null,
      recentWorkDate: recent?.date ?? null,
    };
  }));

  return {
    courses,
    courseCount: courses.length,
    sectionCount: courses.reduce((sum, course) => sum + course.sections.length, 0),
    activeEnrollmentCount: courses.reduce((sum, course) => sum + course.studentCount, 0),
    missingCount: courses.reduce((sum, course) => sum + course.missingCount, 0),
    retakeCount: courses.reduce((sum, course) => sum + course.retakeCount, 0),
    powerSchoolMismatchCount: courses.reduce((sum, course) => sum + course.powerSchoolMismatchCount, 0),
  };
}
