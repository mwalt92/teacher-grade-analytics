import { createClient } from "@/lib/supabase/server";

export type StudentSectionSummary = {
  studentId: string;
  studentName: string;
  sectionId: string;
  sectionName: string;
  offeringId: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearId: string;
  schoolYearLabel: string;
  periodNumber: number | null;
  sortOrder: number;
};

export async function getCurrentStudentSections(): Promise<StudentSectionSummary[]> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const profileId = claimsData?.claims?.sub;
  if (claimsError || typeof profileId !== "string") return [];

  const { data: account, error: accountError } = await supabase
    .from("student_accounts")
    .select("student_id")
    .eq("profile_id", profileId)
    .maybeSingle();
  if (accountError || !account) return [];

  const [{ data: student, error: studentError }, { data: enrollments, error: enrollmentError }] = await Promise.all([
    supabase.from("students").select("id,display_name").eq("id", account.student_id).maybeSingle(),
    supabase.from("enrollments").select("section_id").eq("student_id", account.student_id).eq("active", true),
  ]);
  if (studentError || enrollmentError || !student || !enrollments?.length) return [];

  const sectionIds = enrollments.map((row) => row.section_id);
  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("id,name,offering_id,course_id,school_year_id,period_number,sort_order")
    .in("id", sectionIds)
    .eq("active", true);
  if (sectionsError || !sections?.length) return [];

  const offeringIds = [...new Set(sections.map((section) => section.offering_id))];
  const { data: offerings, error: offeringsError } = await supabase
    .from("course_offerings")
    .select("id,active")
    .in("id", offeringIds);
  if (offeringsError || !offerings) return [];

  const activeOfferingIds = new Set(offerings.filter((offering) => offering.active).map((offering) => offering.id));
  const activeSections = sections.filter((section) => activeOfferingIds.has(section.offering_id));
  if (!activeSections.length) return [];

  const courseIds = [...new Set(activeSections.map((section) => section.course_id))];
  const yearIds = [...new Set(activeSections.map((section) => section.school_year_id))];
  const [{ data: courses, error: coursesError }, { data: years, error: yearsError }] = await Promise.all([
    supabase.from("courses").select("id,name,code").in("id", courseIds),
    supabase.from("school_years").select("id,label").in("id", yearIds),
  ]);
  if (coursesError || yearsError || !courses || !years) return [];

  const courseById = new Map(courses.map((course) => [course.id, course]));
  const yearById = new Map(years.map((year) => [year.id, year]));

  return activeSections.flatMap((section) => {
    const course = courseById.get(section.course_id);
    const year = yearById.get(section.school_year_id);
    if (!course || !year || !section.offering_id) return [];
    return [{
      studentId: student.id,
      studentName: student.display_name,
      sectionId: section.id,
      sectionName: section.name,
      offeringId: section.offering_id,
      courseId: course.id,
      courseName: course.name,
      courseCode: course.code,
      schoolYearId: year.id,
      schoolYearLabel: year.label,
      periodNumber: section.period_number == null ? null : Number(section.period_number),
      sortOrder: Number(section.sort_order) || 0,
    }];
  }).sort((a, b) =>
    b.schoolYearLabel.localeCompare(a.schoolYearLabel)
    || a.courseName.localeCompare(b.courseName)
    || (a.periodNumber ?? Number.MAX_SAFE_INTEGER) - (b.periodNumber ?? Number.MAX_SAFE_INTEGER)
    || a.sortOrder - b.sortOrder
    || a.sectionName.localeCompare(b.sectionName));
}
