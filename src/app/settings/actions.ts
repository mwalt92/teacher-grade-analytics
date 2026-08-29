"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type AssignmentTypeActionResult = {
  success?: string;
  error?: string;
};

async function requireTeacherForSection(sectionId: string) {
  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") throw new Error("Not authenticated");

  const { data: assignment, error } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", userId)
    .eq("section_id", sectionId)
    .maybeSingle();
  if (error) throw error;
  if (!assignment) throw new Error("You do not have access to this section");

  return supabase;
}

function cleanedText(value: FormDataEntryValue | null, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parsePoints(value: FormDataEntryValue | null) {
  const points = Number(value);
  if (!Number.isFinite(points) || points <= 0 || points > 100000) return null;
  return points;
}

function codeBase(name: string) {
  const base = name
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
  return base || "assignment";
}

function revalidateAssignmentTypePaths() {
  revalidatePath("/settings");
  revalidatePath("/assignments");
  revalidatePath("/assignments/new");
  revalidatePath("/gradebook/assignments");
  revalidatePath("/student/preview");
}

async function validateCategoryForSection(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sectionId: string,
  categoryId: string,
) {
  const { data, error } = await supabase
    .from("grading_categories")
    .select("id")
    .eq("id", categoryId)
    .eq("section_id", sectionId)
    .maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

export async function createAssignmentType(formData: FormData): Promise<AssignmentTypeActionResult> {
  try {
    const sectionId = cleanedText(formData.get("sectionId"), 100);
    const name = cleanedText(formData.get("name"), 100);
    const description = cleanedText(formData.get("description"), 240) || null;
    const defaultCategoryId = cleanedText(formData.get("defaultCategoryId"), 100);
    const defaultPointsPossible = parsePoints(formData.get("defaultPointsPossible"));
    const defaultAllowRetakes = String(formData.get("defaultAllowRetakes")) === "true";

    if (!sectionId || !name || !defaultCategoryId || defaultPointsPossible === null) {
      return { error: "Name, default category, and a positive points value are required." };
    }

    const supabase = await requireTeacherForSection(sectionId);
    if (!(await validateCategoryForSection(supabase, sectionId, defaultCategoryId))) {
      return { error: "That grading category is not available for this course." };
    }

    const { data: existingTypes, error: existingError } = await supabase
      .from("assignment_types")
      .select("name,code,sort_order")
      .eq("section_id", sectionId)
      .order("sort_order")
      .order("name");
    if (existingError) throw existingError;

    if ((existingTypes ?? []).some((type) => type.name.trim().toLowerCase() === name.toLowerCase())) {
      return { error: `An assignment type named “${name}” already exists in this course.` };
    }

    const usedCodes = new Set((existingTypes ?? []).map((type) => type.code));
    const base = codeBase(name);
    let code = base;
    let suffix = 2;
    while (usedCodes.has(code)) {
      const suffixText = `_${suffix}`;
      code = `${base.slice(0, Math.max(1, 48 - suffixText.length))}${suffixText}`;
      suffix += 1;
    }

    const maxSort = Math.max(0, ...(existingTypes ?? []).map((type) => type.sort_order ?? 0));
    const { error: insertError } = await supabase.from("assignment_types").insert({
      section_id: sectionId,
      code,
      name,
      description,
      default_category_id: defaultCategoryId,
      default_points_possible: defaultPointsPossible,
      default_allow_retakes: defaultAllowRetakes,
      active: true,
      sort_order: maxSort + 10,
    });
    if (insertError) throw insertError;

    revalidateAssignmentTypePaths();
    return { success: `${name} was added to the New Assignment hotlist.` };
  } catch (error) {
    console.error("Create assignment type failed", error);
    return { error: error instanceof Error ? error.message : "Could not create that assignment type." };
  }
}

export async function updateAssignmentType(formData: FormData): Promise<AssignmentTypeActionResult> {
  try {
    const sectionId = cleanedText(formData.get("sectionId"), 100);
    const assignmentTypeId = cleanedText(formData.get("assignmentTypeId"), 100);
    const name = cleanedText(formData.get("name"), 100);
    const description = cleanedText(formData.get("description"), 240) || null;
    const defaultCategoryId = cleanedText(formData.get("defaultCategoryId"), 100);
    const defaultPointsPossible = parsePoints(formData.get("defaultPointsPossible"));
    const defaultAllowRetakes = String(formData.get("defaultAllowRetakes")) === "true";

    if (!sectionId || !assignmentTypeId || !name || !defaultCategoryId || defaultPointsPossible === null) {
      return { error: "Name, default category, and a positive points value are required." };
    }

    const supabase = await requireTeacherForSection(sectionId);
    const [{ data: currentType, error: typeError }, { data: allTypes, error: namesError }] = await Promise.all([
      supabase.from("assignment_types").select("id,code").eq("id", assignmentTypeId).eq("section_id", sectionId).maybeSingle(),
      supabase.from("assignment_types").select("id,name").eq("section_id", sectionId),
    ]);
    if (typeError) throw typeError;
    if (namesError) throw namesError;
    if (!currentType) return { error: "That assignment type is no longer available in this course." };

    if ((allTypes ?? []).some((type) => type.id !== assignmentTypeId && type.name.trim().toLowerCase() === name.toLowerCase())) {
      return { error: `An assignment type named “${name}” already exists in this course.` };
    }
    if (!(await validateCategoryForSection(supabase, sectionId, defaultCategoryId))) {
      return { error: "That grading category is not available for this course." };
    }

    const { error: updateError } = await supabase
      .from("assignment_types")
      .update({
        name,
        description,
        default_category_id: defaultCategoryId,
        default_points_possible: defaultPointsPossible,
        default_allow_retakes: defaultAllowRetakes,
      })
      .eq("id", assignmentTypeId)
      .eq("section_id", sectionId);
    if (updateError) throw updateError;

    revalidateAssignmentTypePaths();
    return { success: `${name} defaults were saved. Existing assignments were not changed.` };
  } catch (error) {
    console.error("Update assignment type failed", error);
    return { error: error instanceof Error ? error.message : "Could not save that assignment type." };
  }
}

export async function setAssignmentTypeActive(formData: FormData): Promise<AssignmentTypeActionResult> {
  try {
    const sectionId = cleanedText(formData.get("sectionId"), 100);
    const assignmentTypeId = cleanedText(formData.get("assignmentTypeId"), 100);
    const active = String(formData.get("active")) === "true";
    if (!sectionId || !assignmentTypeId) return { error: "Assignment type is required." };

    const supabase = await requireTeacherForSection(sectionId);
    const { data: type, error: typeError } = await supabase
      .from("assignment_types")
      .select("id,name,active")
      .eq("id", assignmentTypeId)
      .eq("section_id", sectionId)
      .maybeSingle();
    if (typeError) throw typeError;
    if (!type) return { error: "That assignment type is no longer available in this course." };

    if (!active && type.active) {
      const { count, error: countError } = await supabase
        .from("assignment_types")
        .select("id", { count: "exact", head: true })
        .eq("section_id", sectionId)
        .eq("active", true);
      if (countError) throw countError;
      if ((count ?? 0) <= 1) return { error: "Keep at least one active assignment type so New Assignment remains usable." };
    }

    const { error: updateError } = await supabase
      .from("assignment_types")
      .update({ active })
      .eq("id", assignmentTypeId)
      .eq("section_id", sectionId);
    if (updateError) throw updateError;

    revalidateAssignmentTypePaths();
    return { success: active ? `${type.name} is back on the hotlist.` : `${type.name} was removed from the hotlist. Existing assignments are preserved.` };
  } catch (error) {
    console.error("Toggle assignment type failed", error);
    return { error: error instanceof Error ? error.message : "Could not change that assignment type." };
  }
}

export async function moveAssignmentType(formData: FormData): Promise<AssignmentTypeActionResult> {
  try {
    const sectionId = cleanedText(formData.get("sectionId"), 100);
    const assignmentTypeId = cleanedText(formData.get("assignmentTypeId"), 100);
    const direction = String(formData.get("direction")) === "down" ? "down" : "up";
    if (!sectionId || !assignmentTypeId) return { error: "Assignment type is required." };

    const supabase = await requireTeacherForSection(sectionId);
    const { data: types, error } = await supabase
      .from("assignment_types")
      .select("id,name,sort_order")
      .eq("section_id", sectionId)
      .order("sort_order")
      .order("name");
    if (error) throw error;

    const ordered = [...(types ?? [])];
    const index = ordered.findIndex((type) => type.id === assignmentTypeId);
    if (index < 0) return { error: "That assignment type is no longer available in this course." };
    const targetIndex = direction === "up" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= ordered.length) return { success: "That assignment type is already at the edge of the list." };

    [ordered[index], ordered[targetIndex]] = [ordered[targetIndex], ordered[index]];
    for (let position = 0; position < ordered.length; position += 1) {
      const { error: reorderError } = await supabase
        .from("assignment_types")
        .update({ sort_order: (position + 1) * 10 })
        .eq("id", ordered[position].id)
        .eq("section_id", sectionId);
      if (reorderError) throw reorderError;
    }

    revalidateAssignmentTypePaths();
    return { success: "Hotlist order updated." };
  } catch (error) {
    console.error("Move assignment type failed", error);
    return { error: error instanceof Error ? error.message : "Could not reorder that assignment type." };
  }
}
