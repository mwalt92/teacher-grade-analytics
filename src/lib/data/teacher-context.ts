import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";

export const ACTIVE_TEACHER_SECTION_COOKIE = "teacher_active_section";

export type TeacherSectionSummary = {
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

export async function getTeacherSections(): Promise<TeacherSectionSummary[]> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const teacherId = claimsData?.claims?.sub;

  if (claimsError || typeof teacherId !== "string") return [];

  const { data: links, error: linksError } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", teacherId);

  if (linksError || !links?.length) return [];
  const sectionIds = links.map((row) => row.section_id);

  const { data: sections, error: sectionsError } = await supabase
    .from("sections")
    .select("id,name,offering_id,course_id,school_year_id,active,period_number,sort_order")
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
  const schoolYearIds = [...new Set(activeSections.map((section) => section.school_year_id))];

  const [{ data: courses, error: coursesError }, { data: schoolYears, error: yearsError }] = await Promise.all([
    supabase.from("courses").select("id,name,code").in("id", courseIds),
    supabase.from("school_years").select("id,label").in("id", schoolYearIds),
  ]);

  if (coursesError || yearsError || !courses || !schoolYears) return [];

  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const yearsById = new Map(schoolYears.map((year) => [year.id, year]));

  return activeSections.flatMap((section) => {
    const course = coursesById.get(section.course_id);
    const schoolYear = yearsById.get(section.school_year_id);
    if (!course || !schoolYear || !section.offering_id) return [];

    return [{
      sectionId: section.id,
      sectionName: section.name,
      offeringId: section.offering_id,
      courseId: course.id,
      courseName: course.name,
      courseCode: course.code,
      schoolYearId: schoolYear.id,
      schoolYearLabel: schoolYear.label,
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

export async function getActiveTeacherSection(): Promise<TeacherSectionSummary | null> {
  const sections = await getTeacherSections();
  if (!sections.length) return null;

  const cookieStore = await cookies();
  const selectedSectionId = cookieStore.get(ACTIVE_TEACHER_SECTION_COOKIE)?.value;
  return sections.find((section) => section.sectionId === selectedSectionId) ?? sections[0];
}
