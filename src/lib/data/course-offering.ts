import { createClient } from "@/lib/supabase/server";

export type CourseOfferingScope = {
  sectionId: string;
  offeringId: string;
  courseId: string;
  schoolYearId: string;
};

export async function getCourseOfferingForSection(sectionId: string): Promise<CourseOfferingScope | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sections")
    .select("id,offering_id,course_id,school_year_id")
    .eq("id", sectionId)
    .maybeSingle();

  if (error || !data?.offering_id) return null;
  return {
    sectionId: data.id,
    offeringId: data.offering_id,
    courseId: data.course_id,
    schoolYearId: data.school_year_id,
  };
}
