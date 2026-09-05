import { createClient } from "@/lib/supabase/server";

export type TeacherCourseLifecycleSection = {
  sectionId: string;
  sectionName: string;
  active: boolean;
  periodNumber: number | null;
  sortOrder: number;
};

export type TeacherCourseLifecycleOffering = {
  offeringId: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearId: string;
  schoolYearLabel: string;
  active: boolean;
  sections: TeacherCourseLifecycleSection[];
  activeSectionCount: number;
  enrollmentCount: number;
  activeEnrollmentCount: number;
  assignmentCount: number;
};

function sortSections(a: TeacherCourseLifecycleSection, b: TeacherCourseLifecycleSection) {
  return (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
    || a.sortOrder - b.sortOrder
    || a.sectionName.localeCompare(b.sectionName);
}

export async function getTeacherCourseLifecycleOfferings(): Promise<TeacherCourseLifecycleOffering[]> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const teacherId = claimsData?.claims?.sub;
  if (claimsError || typeof teacherId !== "string") return [];

  const { data: links, error: linksError } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", teacherId);
  if (linksError || !links?.length) return [];

  const teacherSectionIds = links.map((link) => link.section_id);
  const { data: sections, error: sectionError } = await supabase
    .from("sections")
    .select("id,name,active,period_number,sort_order,offering_id,course_id,school_year_id")
    .in("id", teacherSectionIds);
  if (sectionError || !sections?.length) return [];

  const offeringIds = [...new Set(sections.map((section) => section.offering_id))];
  const courseIds = [...new Set(sections.map((section) => section.course_id))];
  const yearIds = [...new Set(sections.map((section) => section.school_year_id))];
  const sectionIds = sections.map((section) => section.id);

  const [
    { data: offerings, error: offeringError },
    { data: courses, error: courseError },
    { data: schoolYears, error: yearError },
    { data: enrollments, error: enrollmentError },
    { data: assignments, error: assignmentError },
  ] = await Promise.all([
    supabase.from("course_offerings").select("id,active,course_id,school_year_id").in("id", offeringIds),
    supabase.from("courses").select("id,name,code").in("id", courseIds),
    supabase.from("school_years").select("id,label").in("id", yearIds),
    supabase.from("enrollments").select("section_id,active").in("section_id", sectionIds),
    supabase.from("assignments").select("section_id").in("section_id", sectionIds),
  ]);

  if (offeringError || courseError || yearError || enrollmentError || assignmentError || !offerings || !courses || !schoolYears) return [];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const yearById = new Map(schoolYears.map((year) => [year.id, year]));
  const sectionsByOffering = new Map<string, TeacherCourseLifecycleSection[]>();
  for (const section of sections) {
    const list = sectionsByOffering.get(section.offering_id) ?? [];
    list.push({
      sectionId: section.id,
      sectionName: section.name,
      active: Boolean(section.active),
      periodNumber: section.period_number == null ? null : Number(section.period_number),
      sortOrder: Number(section.sort_order) || 0,
    });
    sectionsByOffering.set(section.offering_id, list);
  }

  const enrollmentTotals = new Map<string, number>();
  const activeEnrollmentTotals = new Map<string, number>();
  const offeringBySection = new Map(sections.map((section) => [section.id, section.offering_id]));
  for (const enrollment of enrollments ?? []) {
    const offeringId = offeringBySection.get(enrollment.section_id);
    if (!offeringId) continue;
    enrollmentTotals.set(offeringId, (enrollmentTotals.get(offeringId) ?? 0) + 1);
    if (enrollment.active) activeEnrollmentTotals.set(offeringId, (activeEnrollmentTotals.get(offeringId) ?? 0) + 1);
  }

  const assignmentTotals = new Map<string, number>();
  for (const assignment of assignments ?? []) {
    const offeringId = offeringBySection.get(assignment.section_id);
    if (!offeringId) continue;
    assignmentTotals.set(offeringId, (assignmentTotals.get(offeringId) ?? 0) + 1);
  }

  return offerings.flatMap((offering) => {
    const course = courseById.get(offering.course_id);
    const year = yearById.get(offering.school_year_id);
    const offeringSections = [...(sectionsByOffering.get(offering.id) ?? [])].sort(sortSections);
    if (!course || !year || !offeringSections.length) return [];
    return [{
      offeringId: offering.id,
      courseId: course.id,
      courseName: course.name,
      courseCode: course.code,
      schoolYearId: year.id,
      schoolYearLabel: year.label,
      active: Boolean(offering.active),
      sections: offeringSections,
      activeSectionCount: offeringSections.filter((section) => section.active).length,
      enrollmentCount: enrollmentTotals.get(offering.id) ?? 0,
      activeEnrollmentCount: activeEnrollmentTotals.get(offering.id) ?? 0,
      assignmentCount: assignmentTotals.get(offering.id) ?? 0,
    }];
  }).sort((a, b) =>
    b.schoolYearLabel.localeCompare(a.schoolYearLabel)
    || a.courseName.localeCompare(b.courseName)
    || (a.courseCode ?? "").localeCompare(b.courseCode ?? ""));
}
