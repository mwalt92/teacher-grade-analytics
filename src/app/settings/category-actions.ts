"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GradingCategoryActionResult = {
  success?: string;
  error?: string;
};

type CategoryInput = {
  id: string | null;
  name: string;
  weightPercent: number;
  dropLowest: number;
  lateDeductionPercent: number;
  calculationMethod: "equal_assignment_percentage" | "total_points";
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

function cleanName(value: unknown) {
  return String(value ?? "").trim().slice(0, 100);
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
  return base || "category";
}

function parsePayload(raw: FormDataEntryValue | null): CategoryInput[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry) => ({
      id: typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : null,
      name: cleanName(entry?.name),
      weightPercent: Number(entry?.weightPercent),
      dropLowest: Number(entry?.dropLowest),
      lateDeductionPercent: Number(entry?.lateDeductionPercent),
      calculationMethod: entry?.calculationMethod === "total_points" ? "total_points" : "equal_assignment_percentage",
    }));
  } catch {
    return null;
  }
}

function revalidateCategoryPaths() {
  [
    "/",
    "/settings",
    "/assignments",
    "/assignments/new",
    "/gradebook",
    "/gradebook/assignments",
    "/gradebook/audit",
    "/gradebook/powerschool",
    "/student",
    "/student/preview",
  ].forEach((path) => revalidatePath(path));
}

export async function saveGradingCategories(formData: FormData): Promise<GradingCategoryActionResult> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "").trim();
    const categories = parsePayload(formData.get("categoriesJson"));
    if (!sectionId || !categories?.length) return { error: "At least one grading category is required." };

    const names = categories.map((category) => category.name.toLowerCase());
    if (categories.some((category) => !category.name)) return { error: "Every grading category needs a name." };
    if (new Set(names).size !== names.length) return { error: "Grading category names must be unique within the course." };

    for (const category of categories) {
      if (!Number.isFinite(category.weightPercent) || category.weightPercent <= 0 || category.weightPercent > 100) {
        return { error: `${category.name} needs a weight greater than 0% and no more than 100%.` };
      }
      if (!Number.isInteger(category.dropLowest) || category.dropLowest < 0 || category.dropLowest > 1000) {
        return { error: `${category.name} needs a whole-number Drop lowest value of 0 or more.` };
      }
      if (!Number.isFinite(category.lateDeductionPercent) || category.lateDeductionPercent < 0 || category.lateDeductionPercent > 100) {
        return { error: `${category.name} needs a late deduction between 0% and 100%.` };
      }
    }

    const totalWeight = categories.reduce((sum, category) => sum + category.weightPercent, 0);
    if (Math.abs(totalWeight - 100) > 0.005) {
      return { error: `Category weights must total 100%. They currently total ${totalWeight.toFixed(1)}%.` };
    }

    const supabase = await requireTeacherForSection(sectionId);
    const { data: existing, error: existingError } = await supabase
      .from("grading_categories")
      .select("id,code")
      .eq("section_id", sectionId);
    if (existingError) throw existingError;

    const existingById = new Map((existing ?? []).map((category) => [category.id, category]));
    const submittedExistingIds = categories.filter((category) => category.id).map((category) => category.id as string);
    if (new Set(submittedExistingIds).size !== submittedExistingIds.length) return { error: "A grading category was submitted more than once." };
    if (submittedExistingIds.some((id) => !existingById.has(id))) return { error: "One of those grading categories does not belong to this course." };
    if ((existing ?? []).some((category) => !submittedExistingIds.includes(category.id))) {
      return { error: "Existing grading categories cannot be removed from this screen yet. Keep the category and adjust its settings instead." };
    }

    const usedCodes = new Set((existing ?? []).map((category) => category.code));
    const rows = categories.map((category, index) => {
      const current = category.id ? existingById.get(category.id) : null;
      let code = current?.code ?? codeBase(category.name);
      if (!current) {
        const base = code;
        let suffix = 2;
        while (usedCodes.has(code)) {
          const suffixText = `_${suffix}`;
          code = `${base.slice(0, Math.max(1, 48 - suffixText.length))}${suffixText}`;
          suffix += 1;
        }
        usedCodes.add(code);
      }
      return {
        id: current?.id ?? randomUUID(),
        section_id: sectionId,
        code,
        name: category.name,
        weight: category.weightPercent / 100,
        drop_lowest: category.dropLowest,
        late_deduction: category.lateDeductionPercent / 100,
        calculation_method: category.calculationMethod,
        sort_order: (index + 1) * 10,
      };
    });

    const { error: saveError } = await supabase
      .from("grading_categories")
      .upsert(rows, { onConflict: "id" });
    if (saveError) throw saveError;

    revalidateCategoryPaths();
    return { success: "Grading categories saved. Grade calculations now use this configuration." };
  } catch (error) {
    console.error("Save grading categories failed", error);
    return { error: error instanceof Error ? error.message : "Could not save grading categories." };
  }
}
