"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

function validEmail(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

export async function updateStudentSchoolEmail(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const studentId = String(formData.get("studentId") ?? "");
  const schoolEmail = String(formData.get("schoolEmail") ?? "").trim().toLowerCase();
  if (!sectionId || !studentId) throw new Error("Student and section are required.");
  if (!schoolEmail || !validEmail(schoolEmail)) throw new Error("Enter a valid school email address.");

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const teacherId = claims?.claims?.sub;
  if (typeof teacherId !== "string") throw new Error("Not authenticated.");

  const [{ data: teacherSection }, { data: enrollment }, { data: linkedAccount }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", teacherId).eq("section_id", sectionId).maybeSingle(),
    supabase.from("enrollments").select("id").eq("section_id", sectionId).eq("student_id", studentId).maybeSingle(),
    supabase.from("student_accounts").select("profile_id").eq("student_id", studentId).maybeSingle(),
  ]);
  if (!teacherSection || !enrollment) throw new Error("You do not have access to this student.");
  if (linkedAccount) throw new Error("This student already has a linked login. Email changes are locked to avoid breaking account identity.");

  const { data: duplicate } = await supabase
    .from("students")
    .select("id")
    .eq("school_email", schoolEmail)
    .neq("id", studentId)
    .maybeSingle();
  if (duplicate) throw new Error("That school email is already assigned to another student.");

  const { error } = await supabase.from("students").update({ school_email: schoolEmail }).eq("id", studentId);
  if (error) {
    if (error.code === "23505") throw new Error("That school email is already assigned to another student.");
    throw error;
  }

  revalidatePath("/students");
  revalidatePath("/student");
}
