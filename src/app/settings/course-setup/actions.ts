"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { ACTIVE_TEACHER_SECTION_COOKIE } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";
import { rpcUntyped } from "@/lib/supabase/untyped-rpc";

export type CreateCourseResult = {
  success?: string;
  error?: string;
  sectionId?: string;
};

function text(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function optionalPeriod(formData: FormData) {
  const raw = text(formData, "periodNumber", 3);
  if (!raw) return null;
  const value = Number(raw);
  return Number.isInteger(value) && value >= 0 && value <= 99 ? value : NaN;
}

function revalidateTeacherWorkspace() {
  ["/", "/settings", "/settings/courses", "/settings/templates", "/settings/course-setup", "/students", "/assignments", "/assignments/new", "/gradebook", "/analytics"].forEach((path) => revalidatePath(path));
}

export async function createTeacherCourse(formData: FormData): Promise<CreateCourseResult> {
  try {
    const courseName = text(formData, "courseName", 160);
    const courseCode = text(formData, "courseCode", 40);
    const schoolYearId = text(formData, "schoolYearId", 100);
    const sectionName = text(formData, "sectionName", 100);
    const sourceOfferingId = text(formData, "sourceOfferingId", 100) || null;
    const templateId = text(formData, "templateId", 100) || null;
    const periodNumber = optionalPeriod(formData);
    const copyCategories = formData.get("copyCategories") === "true";
    const copyAssignmentTypes = formData.get("copyAssignmentTypes") === "true";
    const copyGradingPeriods = formData.get("copyGradingPeriods") === "true";

    if (!courseName) return { error: "Course name is required." };
    if (!schoolYearId) return { error: "School year is required." };
    if (!sectionName) return { error: "First section name is required." };
    if (Number.isNaN(periodNumber)) return { error: "Class period must be a whole number between 0 and 99." };
    if (sourceOfferingId && templateId) return { error: "Choose either a reusable template or a source course, not both." };
    if (copyAssignmentTypes && !copyCategories) return { error: "Assignment types require grading categories to be copied too." };

    const supabase = await createClient();
    const { data: claims, error: claimsError } = await supabase.auth.getClaims();
    if (claimsError || typeof claims?.claims?.sub !== "string") return { error: "Please sign in again." };

    let sectionId: string | null = null;
    if (templateId) {
      const result = await rpcUntyped<string>(supabase, "create_teacher_course_from_template", {
        p_course_name: courseName,
        p_course_code: courseCode || null,
        p_school_year_id: schoolYearId,
        p_section_name: sectionName,
        p_period_number: periodNumber,
        p_template_id: templateId,
        p_copy_categories: copyCategories,
        p_copy_assignment_types: copyAssignmentTypes,
        p_copy_grading_periods: copyGradingPeriods,
      });
      if (result.error) throw result.error;
      sectionId = result.data;
    } else {
      const { data, error } = await supabase.rpc("create_teacher_course", {
        p_course_name: courseName,
        p_course_code: courseCode || null,
        p_school_year_id: schoolYearId,
        p_section_name: sectionName,
        p_period_number: periodNumber,
        p_source_offering_id: sourceOfferingId,
        p_copy_categories: copyCategories,
        p_copy_assignment_types: copyAssignmentTypes,
        p_copy_grading_periods: copyGradingPeriods,
      });
      if (error) throw error;
      sectionId = data;
    }

    if (!sectionId) throw new Error("The course was created, but its first section could not be selected.");

    const cookieStore = await cookies();
    cookieStore.set(ACTIVE_TEACHER_SECTION_COOKIE, sectionId, {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    });

    revalidateTeacherWorkspace();
    return { success: `${courseName} is ready.`, sectionId };
  } catch (error) {
    console.error("Create teacher course failed", error);
    return { error: error instanceof Error ? error.message : "Could not create that course." };
  }
}
