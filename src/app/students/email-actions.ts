"use server";

import { revalidatePath } from "next/cache";
import { parseSchoolEmailList } from "@/lib/import/roster-email-reconciliation";
import { createClient } from "@/lib/supabase/server";

export type RosterEmailCommitState = {
  error?: string;
  success?: string;
  summary?: {
    updated: number;
    unchanged: number;
  };
};

type SubmittedMapping = { studentNumber: string; email: string };

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

  return { supabase };
}

function parseMapping(value: FormDataEntryValue | null): SubmittedMapping[] {
  if (typeof value !== "string" || !value.trim()) throw new Error("Review the email matches before saving.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("The reviewed email mapping could not be read.");
  }
  if (!Array.isArray(parsed)) throw new Error("The reviewed email mapping could not be validated.");

  const mappings: SubmittedMapping[] = [];
  for (const item of parsed) {
    if (!item || typeof item !== "object") throw new Error("The reviewed email mapping could not be validated.");
    const candidate = item as Partial<SubmittedMapping>;
    if (typeof candidate.studentNumber !== "string" || typeof candidate.email !== "string") {
      throw new Error("The reviewed email mapping could not be validated.");
    }
    mappings.push({ studentNumber: candidate.studentNumber.trim(), email: candidate.email.trim().toLowerCase() });
  }
  return mappings;
}

export async function updateRosterEmails(
  _previousState: RosterEmailCommitState,
  formData: FormData,
): Promise<RosterEmailCommitState> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "");
    const sourceEmails = String(formData.get("sourceEmails") ?? "").trim();
    if (!sectionId) return { error: "A section is required." };
    if (!sourceEmails) return { error: "Paste the PowerSchool email list first." };

    const parsedSource = parseSchoolEmailList(sourceEmails);
    if (parsedSource.invalidTokens.length > 0) return { error: "The pasted list contains one or more invalid email values." };
    if (parsedSource.duplicateEmails.length > 0) return { error: "The pasted list contains duplicate email addresses." };

    const mappings = parseMapping(formData.get("mappingJson"));
    const mappingNumbers = mappings.map((item) => item.studentNumber);
    const mappingEmails = mappings.map((item) => item.email);
    if (new Set(mappingNumbers).size !== mappingNumbers.length) return { error: "A student was mapped more than once." };
    if (new Set(mappingEmails).size !== mappingEmails.length) return { error: "An email address was mapped to more than one student." };
    if (mappingEmails.some((email) => !parsedSource.emails.includes(email))) return { error: "A reviewed email is not present in the pasted PowerSchool list." };
    if (mappings.length !== parsedSource.emails.length) return { error: "Every pasted email must be matched exactly once before saving." };

    const { supabase } = await requireTeacherForSection(sectionId);
    const { data: enrollments, error: enrollmentError } = await supabase
      .from("enrollments")
      .select("student_id")
      .eq("section_id", sectionId)
      .eq("active", true);
    if (enrollmentError) throw enrollmentError;

    const studentIds = [...new Set((enrollments ?? []).map((row) => row.student_id))];
    if (studentIds.length === 0) return { error: "This section does not have an active roster to reconcile." };

    const { data: students, error: studentError } = await supabase
      .from("students")
      .select("id,external_student_key,school_email")
      .in("id", studentIds);
    if (studentError) throw studentError;

    const rosterByNumber = new Map<string, { id: string; email: string | null }>();
    for (const student of students ?? []) {
      if (student.external_student_key) rosterByNumber.set(student.external_student_key, { id: student.id, email: student.school_email });
    }

    if (rosterByNumber.size !== studentIds.length) {
      return { error: "At least one active student is missing the required roster identity key. Resolve that student before reconciling emails." };
    }
    if (mappings.length !== rosterByNumber.size) {
      return { error: "The email list count does not match the active roster. Review unmatched students or emails before saving." };
    }
    for (const mapping of mappings) {
      if (!rosterByNumber.has(mapping.studentNumber)) return { error: "The reviewed mapping contains a student who is not active in this section." };
    }

    const proposedEmailSet = new Set(mappingEmails);
    if (proposedEmailSet.size > 0) {
      const { data: existingOwners, error: ownerError } = await supabase
        .from("students")
        .select("id,school_email")
        .in("school_email", [...proposedEmailSet]);
      if (ownerError) throw ownerError;

      const idByEmail = new Map(mappings.map((mapping) => [mapping.email, rosterByNumber.get(mapping.studentNumber)?.id]));
      for (const owner of existingOwners ?? []) {
        if (!owner.school_email) continue;
        const expectedId = idByEmail.get(owner.school_email);
        if (expectedId && expectedId !== owner.id) {
          return { error: "One of those emails is already linked to a different student. Nothing was changed." };
        }
      }
    }

    let updated = 0;
    let unchanged = 0;
    for (const mapping of mappings) {
      const rosterStudent = rosterByNumber.get(mapping.studentNumber);
      if (!rosterStudent) continue;
      if (rosterStudent.email?.toLowerCase() === mapping.email) {
        unchanged += 1;
        continue;
      }
      const { error } = await supabase.from("students").update({ school_email: mapping.email }).eq("id", rosterStudent.id);
      if (error) throw error;
      updated += 1;
    }

    revalidatePath("/students");
    return {
      success: "School emails updated.",
      summary: { updated, unchanged },
    };
  } catch (error) {
    console.error("Roster email reconciliation failed", error);
    return { error: error instanceof Error ? error.message : "Could not update school emails." };
  }
}
