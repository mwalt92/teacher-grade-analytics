"use server";

import { revalidatePath } from "next/cache";
import { parsePowerSchoolWorkbook } from "@/lib/import/powerschool-roster";
import { createClient } from "@/lib/supabase/server";

async function requireTeacherForSection(sectionId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") throw new Error("Not authenticated");

  const { data: assignment } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", userId)
    .eq("section_id", sectionId)
    .maybeSingle();

  if (!assignment) throw new Error("You do not have access to this section");
  return supabase;
}

export type RosterImportPreviewState = {
  error?: string;
  fileName?: string;
  totalRows?: number;
  hasStudentNumbers?: boolean;
  warnings?: string[];
  groups?: Array<{
    course: string;
    studentCount: number;
    existingCount: number;
    newCount: number;
    nameOnlyCount: number;
    students: Array<{ name: string; studentNumber: string | null; existing: boolean }>;
  }>;
};

export async function previewRosterImport(
  _previousState: RosterImportPreviewState,
  formData: FormData,
): Promise<RosterImportPreviewState> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "");
    const file = formData.get("rosterFile");
    if (!sectionId) return { error: "A section is required." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a PowerSchool .xlsx roster file." };

    const supabase = await requireTeacherForSection(sectionId);
    const preview = await parsePowerSchoolWorkbook(file);
    const studentNumbers = [...new Set(preview.rows.map((row) => row.studentNumber).filter((value): value is string => Boolean(value)))];

    const existingNumbers = new Set<string>();
    if (studentNumbers.length > 0) {
      const { data: existing, error } = await supabase
        .from("students")
        .select("external_student_key")
        .in("external_student_key", studentNumbers);
      if (error) throw error;
      existing?.forEach((student) => {
        if (student.external_student_key) existingNumbers.add(student.external_student_key);
      });
    }

    return {
      fileName: preview.fileName,
      totalRows: preview.rows.length,
      hasStudentNumbers: preview.hasStudentNumbers,
      warnings: preview.warnings,
      groups: preview.courseGroups.map((group) => {
        const students = group.rows.map((row) => ({
          name: row.displayName,
          studentNumber: row.studentNumber,
          existing: row.studentNumber ? existingNumbers.has(row.studentNumber) : false,
        }));
        const existingCount = students.filter((student) => student.existing).length;
        const nameOnlyCount = students.filter((student) => !student.studentNumber).length;
        return {
          course: group.course,
          studentCount: students.length,
          existingCount,
          newCount: students.length - existingCount,
          nameOnlyCount,
          students,
        };
      }),
    };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Could not read that roster file." };
  }
}

export async function addStudent(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const schoolEmail = String(formData.get("schoolEmail") ?? "").trim().toLowerCase() || null;
  if (!sectionId || !displayName || !studentNumber) throw new Error("Name and student number are required");

  const supabase = await requireTeacherForSection(sectionId);
  const { data: existing } = await supabase
    .from("students")
    .select("id,display_name,school_email")
    .eq("external_student_key", studentNumber)
    .maybeSingle();

  let studentId: string;
  if (existing) {
    studentId = existing.id;
    await supabase.from("students").update({ display_name: displayName, school_email: schoolEmail ?? existing.school_email }).eq("id", studentId);
  } else {
    const { data: student, error } = await supabase
      .from("students")
      .insert({ display_name: displayName, external_student_key: studentNumber, school_email: schoolEmail })
      .select("id")
      .single();
    if (error) throw error;
    studentId = student.id;
  }

  const { error: enrollmentError } = await supabase.from("enrollments").upsert({
    student_id: studentId,
    section_id: sectionId,
    enrolled_on: new Date().toISOString().slice(0, 10),
    active: true,
    exited_on: null,
  }, { onConflict: "student_id,section_id" });
  if (enrollmentError) throw enrollmentError;

  revalidatePath("/");
  revalidatePath("/students");
}

export async function setEnrollmentActive(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const enrollmentId = String(formData.get("enrollmentId") ?? "");
  const active = String(formData.get("active")) === "true";
  if (!sectionId || !enrollmentId) throw new Error("Enrollment is required");

  const supabase = await requireTeacherForSection(sectionId);
  const { error } = await supabase.from("enrollments").update({
    active,
    exited_on: active ? null : new Date().toISOString().slice(0, 10),
  }).eq("id", enrollmentId).eq("section_id", sectionId);
  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/students");
}
