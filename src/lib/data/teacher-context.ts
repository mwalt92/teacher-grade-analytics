import { createClient } from "@/lib/supabase/server";

export type TeacherSectionSummary = {
  sectionId: string;
  sectionName: string;
  courseId: string;
  courseName: string;
  courseCode: string | null;
  schoolYearId: string;
  schoolYearLabel: string;
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
    .select("id,name,course_id,school_year_id")
    .in("id", sectionIds);

  if (sectionsError || !sections?.length) return [];

  const courseIds = [...new Set(sections.map((section) => section.course_id))];
  const schoolYearIds = [...new Set(sections.map((section) => section.school_year_id))];

  const [{ data: courses, error: coursesError }, { data: schoolYears, error: yearsError }] = await Promise.all([
    supabase.from("courses").select("id,name,code").in("id", courseIds),
    supabase.from("school_years").select("id,label").in("id", schoolYearIds),
  ]);

  if (coursesError || yearsError || !courses || !schoolYears) return [];

  const coursesById = new Map(courses.map((course) => [course.id, course]));
  const yearsById = new Map(schoolYears.map((year) => [year.id, year]));

  return sections.flatMap((section) => {
    const course = coursesById.get(section.course_id);
    const schoolYear = yearsById.get(section.school_year_id);
    if (!course || !schoolYear) return [];

    return [{
      sectionId: section.id,
      sectionName: section.name,
      courseId: course.id,
      courseName: course.name,
      courseCode: course.code,
      schoolYearId: schoolYear.id,
      schoolYearLabel: schoolYear.label,
    }];
  });
}
