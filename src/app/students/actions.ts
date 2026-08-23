"use server";

import { revalidatePath } from "next/cache";
import { parsePowerSchoolWorkbook, type ParsedRosterRow } from "@/lib/import/powerschool-roster";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

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
  return { supabase, userId };
}

export type RosterImportPreviewState = {
  error?: string;
  batchId?: string;
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

export type RosterImportCommitState = {
  error?: string;
  success?: string;
  summary?: {
    coursesImported: number;
    studentsCreated: number;
    studentsMatched: number;
    enrollmentsCreated: number;
    enrollmentsReactivated: number;
    enrollmentsAlreadyActive: number;
  };
};

function isParsedRosterRow(value: unknown): value is ParsedRosterRow {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<ParsedRosterRow>;
  return typeof row.displayName === "string" && typeof row.course === "string" && (typeof row.studentNumber === "string" || row.studentNumber === null);
}

export async function previewRosterImport(
  _previousState: RosterImportPreviewState,
  formData: FormData,
): Promise<RosterImportPreviewState> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "");
    const file = formData.get("rosterFile");
    if (!sectionId) return { error: "A section is required." };
    if (!(file instanceof File) || file.size === 0) return { error: "Choose a PowerSchool .xlsx roster file." };

    const { supabase, userId } = await requireTeacherForSection(sectionId);
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

    const { data: batch, error: batchError } = await supabase
      .from("roster_import_batches")
      .insert({
        teacher_id: userId,
        source_filename: preview.fileName,
        parsed_rows: preview.rows as unknown as Json,
        warnings: preview.warnings as unknown as Json,
      })
      .select("id")
      .single();
    if (batchError) throw batchError;

    return {
      batchId: batch.id,
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

export async function importRosterBatch(
  _previousState: RosterImportCommitState,
  formData: FormData,
): Promise<RosterImportCommitState> {
  try {
    const anchorSectionId = String(formData.get("sectionId") ?? "");
    const batchId = String(formData.get("batchId") ?? "");
    if (!anchorSectionId || !batchId) return { error: "The roster preview has expired. Preview the file again." };

    const { supabase, userId } = await requireTeacherForSection(anchorSectionId);
    const { data: batch, error: batchError } = await supabase
      .from("roster_import_batches")
      .select("id,teacher_id,parsed_rows,status,expires_at")
      .eq("id", batchId)
      .eq("teacher_id", userId)
      .maybeSingle();
    if (batchError) throw batchError;
    if (!batch || batch.status !== "preview") return { error: "This roster preview is no longer available for import." };
    if (new Date(batch.expires_at).getTime() < Date.now()) return { error: "This roster preview expired. Preview the file again." };

    if (!Array.isArray(batch.parsed_rows) || !batch.parsed_rows.every(isParsedRosterRow)) {
      return { error: "The stored roster preview could not be validated." };
    }
    const rows = batch.parsed_rows as ParsedRosterRow[];
    const courses = [...new Set(rows.map((row) => row.course))].sort((a, b) => a.localeCompare(b));
    const mappings = courses.map((course, index) => ({ course, sectionId: String(formData.get(`course-${index}`) ?? "") })).filter((mapping) => mapping.sectionId);
    if (mappings.length === 0) return { error: "Choose at least one destination section." };

    const selectedSectionIds = [...new Set(mappings.map((mapping) => mapping.sectionId))];
    const { data: allowedSections, error: allowedError } = await supabase
      .from("teacher_sections")
      .select("section_id")
      .eq("teacher_id", userId)
      .in("section_id", selectedSectionIds);
    if (allowedError) throw allowedError;
    if ((allowedSections?.length ?? 0) !== selectedSectionIds.length) return { error: "One or more destination sections are not available to your account." };

    const sectionByCourse = new Map(mappings.map((mapping) => [mapping.course, mapping.sectionId]));
    const selectedRows = rows.filter((row) => sectionByCourse.has(row.course));
    if (selectedRows.some((row) => !row.studentNumber)) {
      return { error: "This file contains name-only students. Re-export the roster with Student Number before importing; the current file is safe to preview but not commit." };
    }

    const uniqueByNumber = new Map<string, ParsedRosterRow>();
    for (const row of selectedRows) {
      const studentNumber = row.studentNumber as string;
      const previous = uniqueByNumber.get(studentNumber);
      if (previous && previous.displayName !== row.displayName) {
        return { error: `Student #${studentNumber} appears with more than one name. Resolve that conflict in PowerSchool before importing.` };
      }
      uniqueByNumber.set(studentNumber, row);
    }

    const studentNumbers = [...uniqueByNumber.keys()];
    const { data: existingStudents, error: existingError } = await supabase
      .from("students")
      .select("id,external_student_key")
      .in("external_student_key", studentNumbers);
    if (existingError) throw existingError;

    const idByNumber = new Map<string, string>();
    const existingNumbers = new Set<string>();
    existingStudents?.forEach((student) => {
      if (student.external_student_key) {
        existingNumbers.add(student.external_student_key);
        idByNumber.set(student.external_student_key, student.id);
      }
    });

    const newStudentPayload = [...uniqueByNumber.entries()]
      .filter(([studentNumber]) => !existingNumbers.has(studentNumber))
      .map(([studentNumber, row]) => {
        const id = crypto.randomUUID();
        idByNumber.set(studentNumber, id);
        return {
          id,
          external_student_key: studentNumber,
          display_name: row.displayName,
          first_name: row.firstName,
          last_name: row.lastName,
        };
      });

    if (newStudentPayload.length > 0) {
      const { error: studentError } = await supabase.from("students").insert(newStudentPayload);
      if (studentError) throw studentError;
    }

    const desiredPairs = new Map<string, { student_id: string; section_id: string }>();
    for (const row of selectedRows) {
      const studentId = idByNumber.get(row.studentNumber as string);
      const sectionId = sectionByCourse.get(row.course);
      if (!studentId || !sectionId) continue;
      desiredPairs.set(`${studentId}:${sectionId}`, { student_id: studentId, section_id: sectionId });
    }

    const desired = [...desiredPairs.values()];
    const existingStudentIds = [...new Set((existingStudents ?? []).map((student) => student.id))];
    let existingEnrollments: Array<{ id: string; student_id: string; section_id: string; active: boolean }> = [];
    if (existingStudentIds.length > 0) {
      const { data, error: enrollmentQueryError } = await supabase
        .from("enrollments")
        .select("id,student_id,section_id,active")
        .in("student_id", existingStudentIds)
        .in("section_id", selectedSectionIds);
      if (enrollmentQueryError) throw enrollmentQueryError;
      existingEnrollments = data ?? [];
    }

    const existingEnrollmentByPair = new Map(existingEnrollments.map((enrollment) => [`${enrollment.student_id}:${enrollment.section_id}`, enrollment]));
    const newEnrollments = desired.filter((item) => !existingEnrollmentByPair.has(`${item.student_id}:${item.section_id}`));
    const inactiveEnrollmentIds = desired
      .map((item) => existingEnrollmentByPair.get(`${item.student_id}:${item.section_id}`))
      .filter((enrollment): enrollment is NonNullable<typeof enrollment> => Boolean(enrollment && !enrollment.active))
      .map((enrollment) => enrollment.id);
    const alreadyActiveCount = desired.length - newEnrollments.length - inactiveEnrollmentIds.length;

    if (newEnrollments.length > 0) {
      const today = new Date().toISOString().slice(0, 10);
      const { error } = await supabase.from("enrollments").insert(newEnrollments.map((item) => ({ ...item, enrolled_on: today, active: true })));
      if (error) throw error;
    }
    if (inactiveEnrollmentIds.length > 0) {
      const { error } = await supabase.from("enrollments").update({ active: true, exited_on: null }).in("id", inactiveEnrollmentIds);
      if (error) throw error;
    }

    const summary = {
      coursesImported: mappings.length,
      studentsCreated: newStudentPayload.length,
      studentsMatched: existingNumbers.size,
      enrollmentsCreated: newEnrollments.length,
      enrollmentsReactivated: inactiveEnrollmentIds.length,
      enrollmentsAlreadyActive: alreadyActiveCount,
    };

    const { error: finishError } = await supabase
      .from("roster_import_batches")
      .update({ status: "imported", imported_at: new Date().toISOString(), result_summary: summary as unknown as Json })
      .eq("id", batchId);
    if (finishError) throw finishError;

    revalidatePath("/");
    revalidatePath("/students");
    return { success: "Roster import completed.", summary };
  } catch (error) {
    console.error("Roster import failed", error);
    return { error: error instanceof Error ? error.message : "Roster import failed." };
  }
}

export async function addStudent(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  const studentNumber = String(formData.get("studentNumber") ?? "").trim();
  const schoolEmail = String(formData.get("schoolEmail") ?? "").trim().toLowerCase() || null;
  if (!sectionId || !displayName || !studentNumber) throw new Error("Name and student number are required");

  const { supabase } = await requireTeacherForSection(sectionId);
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
    studentId = crypto.randomUUID();
    const { error } = await supabase
      .from("students")
      .insert({ id: studentId, display_name: displayName, external_student_key: studentNumber, school_email: schoolEmail });
    if (error) throw error;
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

  const { supabase } = await requireTeacherForSection(sectionId);
  const { error } = await supabase.from("enrollments").update({
    active,
    exited_on: active ? null : new Date().toISOString().slice(0, 10),
  }).eq("id", enrollmentId).eq("section_id", sectionId);
  if (error) throw error;

  revalidatePath("/");
  revalidatePath("/students");
}
