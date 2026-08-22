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

  if (claimsError || !claimsData?.claims?.sub) return [];

  const { data, error } = await supabase
    .from("teacher_sections")
    .select("section_id, sections(id,name,course_id,school_year_id,courses(id,name,code),school_years(id,label))")
    .eq("teacher_id", claimsData.claims.sub);

  if (error || !data) return [];

  return data.flatMap((row) => {
    const section = row.sections as unknown as {
      id: string;
      name: string;
      course_id: string;
      school_year_id: string;
      courses: { id: string; name: string; code: string | null } | null;
      school_years: { id: string; label: string } | null;
    } | null;

    if (!section?.courses || !section.school_years) return [];

    return [{
      sectionId: section.id,
      sectionName: section.name,
      courseId: section.courses.id,
      courseName: section.courses.name,
      courseCode: section.courses.code,
      schoolYearId: section.school_years.id,
      schoolYearLabel: section.school_years.label,
    }];
  });
}
