import { createClient } from "@/lib/supabase/server";
import { rpcUntyped } from "@/lib/supabase/untyped-rpc";

export type TeacherCourseTemplate = {
  id: string;
  name: string;
  description: string | null;
  defaultCourseName: string;
  defaultCourseCode: string | null;
  categoryCount: number;
  assignmentTypeCount: number;
  gradingPeriodCount: number;
  createdAt: string;
  updatedAt: string;
};

type TemplateRow = {
  id: string;
  name: string;
  description: string | null;
  default_course_name: string;
  default_course_code: string | null;
  category_count: number;
  assignment_type_count: number;
  grading_period_count: number;
  created_at: string;
  updated_at: string;
};

export async function getTeacherCourseTemplates(): Promise<TeacherCourseTemplate[]> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claimsData?.claims?.sub !== "string") return [];

  const { data, error } = await rpcUntyped<TemplateRow[]>(supabase, "list_teacher_course_templates");
  if (error || !data) return [];

  return data.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    defaultCourseName: row.default_course_name,
    defaultCourseCode: row.default_course_code,
    categoryCount: Number(row.category_count) || 0,
    assignmentTypeCount: Number(row.assignment_type_count) || 0,
    gradingPeriodCount: Number(row.grading_period_count) || 0,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
