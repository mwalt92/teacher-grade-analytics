"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type CourseSectionActionResult = {
  success?: string;
  error?: string;
};

function cleanText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parsePeriod(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  if (!text) return null;
  const period = Number(text);
  return Number.isInteger(period) && period >= 0 && period <= 99 ? period : NaN;
}

function revalidateSectionPaths() {
  ["/", "/settings", "/students", "/assignments", "/assignments/new", "/gradebook", "/analytics"].forEach((path) => revalidatePath(path));
}

async function requireTeacherForOffering(offeringId: string) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") throw new Error("Not authenticated");

  const { data: offering, error } = await supabase
    .from("course_offerings")
    .select("id,course_id,school_year_id")
    .eq("id", offeringId)
    .maybeSingle();
  if (error) throw error;
  if (!offering) throw new Error("You do not have access to this course offering");

  return { supabase, userId, offering };
}

export async function createCourseSection(formData: FormData): Promise<CourseSectionActionResult> {
  try {
    const offeringId = cleanText(formData.get("offeringId"), 100);
    const name = cleanText(formData.get("name"), 100);
    const periodNumber = parsePeriod(formData.get("periodNumber"));
    if (!offeringId || !name) return { error: "Section name is required." };
    if (Number.isNaN(periodNumber)) return { error: "Class period must be a whole number between 0 and 99." };

    const { supabase } = await requireTeacherForOffering(offeringId);
    const { data: sectionId, error } = await supabase.rpc("create_teacher_section", {
      p_offering_id: offeringId,
      p_name: name,
      p_period_number: periodNumber,
    });
    if (error) throw error;

    revalidateSectionPaths();
    return { success: `${name} was added to this course.${sectionId ? "" : ""}` };
  } catch (error) {
    console.error("Create course section failed", error);
    return { error: error instanceof Error ? error.message : "Could not add that section." };
  }
}

export async function updateCourseSection(formData: FormData): Promise<CourseSectionActionResult> {
  try {
    const offeringId = cleanText(formData.get("offeringId"), 100);
    const sectionId = cleanText(formData.get("sectionId"), 100);
    const name = cleanText(formData.get("name"), 100);
    const periodNumber = parsePeriod(formData.get("periodNumber"));
    if (!offeringId || !sectionId || !name) return { error: "Section name is required." };
    if (Number.isNaN(periodNumber)) return { error: "Class period must be a whole number between 0 and 99." };

    const { supabase } = await requireTeacherForOffering(offeringId);
    const { data: duplicate, error: duplicateError } = await supabase
      .from("sections")
      .select("id")
      .eq("offering_id", offeringId)
      .ilike("name", name)
      .neq("id", sectionId)
      .maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return { error: `A section named “${name}” already exists in this course.` };

    const { error } = await supabase
      .from("sections")
      .update({ name, period_number: periodNumber })
      .eq("id", sectionId)
      .eq("offering_id", offeringId);
    if (error) throw error;

    revalidateSectionPaths();
    return { success: `${name} was updated.` };
  } catch (error) {
    console.error("Update course section failed", error);
    return { error: error instanceof Error ? error.message : "Could not update that section." };
  }
}

export async function setCourseSectionActive(formData: FormData): Promise<CourseSectionActionResult> {
  try {
    const offeringId = cleanText(formData.get("offeringId"), 100);
    const sectionId = cleanText(formData.get("sectionId"), 100);
    const active = String(formData.get("active")) === "true";
    if (!offeringId || !sectionId) return { error: "Section is required." };

    const { supabase } = await requireTeacherForOffering(offeringId);
    const { data: section, error: sectionError } = await supabase
      .from("sections")
      .select("id,name,active")
      .eq("id", sectionId)
      .eq("offering_id", offeringId)
      .maybeSingle();
    if (sectionError) throw sectionError;
    if (!section) return { error: "That section is no longer available." };

    if (!active && section.active) {
      const { count, error: countError } = await supabase
        .from("sections")
        .select("id", { count: "exact", head: true })
        .eq("offering_id", offeringId)
        .eq("active", true);
      if (countError) throw countError;
      if ((count ?? 0) <= 1) return { error: "Keep at least one active section for this course." };
    }

    const { error } = await supabase
      .from("sections")
      .update({ active })
      .eq("id", sectionId)
      .eq("offering_id", offeringId);
    if (error) throw error;

    revalidateSectionPaths();
    return { success: active ? `${section.name} is active again.` : `${section.name} was hidden from everyday course switching.` };
  } catch (error) {
    console.error("Toggle course section failed", error);
    return { error: error instanceof Error ? error.message : "Could not change that section." };
  }
}
