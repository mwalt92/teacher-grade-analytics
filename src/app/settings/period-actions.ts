"use server";

import { randomUUID } from "crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export type GradingPeriodActionResult = {
  success?: string;
  error?: string;
};

type PeriodMode = "direct" | "composite";
type PeriodRole = "standard" | "exam";
type ComponentInput = { componentClientKey: string; weightPercent: number };
type PeriodInput = {
  clientKey: string;
  id: string | null;
  code: string;
  name: string;
  calculationMode: PeriodMode;
  periodRole: PeriodRole;
  components: ComponentInput[];
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

function cleanText(value: unknown, maxLength: number) {
  return String(value ?? "").trim().slice(0, maxLength);
}

function parsePayload(raw: FormDataEntryValue | null): PeriodInput[] | null {
  try {
    const parsed = JSON.parse(String(raw ?? ""));
    if (!Array.isArray(parsed)) return null;
    return parsed.map((entry) => ({
      clientKey: cleanText(entry?.clientKey, 100),
      id: typeof entry?.id === "string" && entry.id.trim() ? entry.id.trim() : null,
      code: cleanText(entry?.code, 16),
      name: cleanText(entry?.name, 100),
      calculationMode: entry?.calculationMode === "composite" ? "composite" : "direct",
      periodRole: entry?.periodRole === "exam" ? "exam" : "standard",
      components: Array.isArray(entry?.components)
        ? entry.components.map((component: unknown) => {
            const row = component as { componentClientKey?: unknown; weightPercent?: unknown };
            return {
              componentClientKey: cleanText(row?.componentClientKey, 100),
              weightPercent: Number(row?.weightPercent),
            };
          })
        : [],
    }));
  } catch {
    return null;
  }
}

function revalidatePeriodPaths() {
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

export async function saveGradingPeriods(formData: FormData): Promise<GradingPeriodActionResult> {
  try {
    const sectionId = String(formData.get("sectionId") ?? "").trim();
    const periods = parsePayload(formData.get("periodsJson"));
    if (!sectionId || !periods?.length) return { error: "At least one grading period is required." };

    const clientKeys = periods.map((period) => period.clientKey);
    if (periods.some((period) => !period.clientKey)) return { error: "A grading period is missing its internal form key." };
    if (new Set(clientKeys).size !== clientKeys.length) return { error: "A grading period was submitted more than once." };
    if (periods.some((period) => !period.name || !period.code)) return { error: "Every grading period needs a short code and name." };
    if (periods.some((period) => !/^[A-Za-z0-9][A-Za-z0-9_-]{0,15}$/.test(period.code))) {
      return { error: "Period codes may use only letters, numbers, hyphens, and underscores." };
    }

    const supabase = await requireTeacherForSection(sectionId);
    const { data: existing, error: existingError } = await supabase
      .from("grading_periods")
      .select("id,code,calculation_mode")
      .eq("section_id", sectionId);
    if (existingError) throw existingError;

    const existingById = new Map((existing ?? []).map((period) => [period.id, period]));
    const submittedExistingIds = periods.filter((period) => period.id).map((period) => period.id as string);
    if (new Set(submittedExistingIds).size !== submittedExistingIds.length) return { error: "A saved grading period was submitted more than once." };
    if (submittedExistingIds.some((id) => !existingById.has(id))) return { error: "One of those grading periods does not belong to this course." };
    if ((existing ?? []).some((period) => !submittedExistingIds.includes(period.id))) {
      return { error: "Existing grading periods cannot be removed from this screen yet." };
    }

    for (const period of periods) {
      const current = period.id ? existingById.get(period.id) : null;
      if (current) {
        if (current.code !== period.code) return { error: `${current.code} is an established period code and cannot be changed.` };
        const currentMode: PeriodMode = current.calculation_mode === "composite" ? "composite" : "direct";
        if (currentMode !== period.calculationMode) return { error: `${period.code} cannot change between direct and composite after it has been created.` };
      } else {
        period.code = period.code.toUpperCase();
      }
      if (period.calculationMode === "composite" && period.periodRole !== "standard") {
        return { error: `${period.code} is composite, so its role must remain Standard.` };
      }
    }

    const names = periods.map((period) => period.name.toLowerCase());
    const codes = periods.map((period) => period.code.toLowerCase());
    if (new Set(names).size !== names.length) return { error: "Grading-period names must be unique within the course." };
    if (new Set(codes).size !== codes.length) return { error: "Grading-period codes must be unique within the course." };
    if (!periods.some((period) => period.calculationMode === "direct")) {
      return { error: "Keep at least one direct grading period so assignments have somewhere to belong." };
    }

    const byClientKey = new Map(periods.map((period) => [period.clientKey, period]));
    for (const period of periods) {
      if (period.calculationMode === "direct") {
        if (period.components.length) return { error: `${period.code} is direct and cannot contain component periods.` };
        continue;
      }
      if (!period.components.length) return { error: `${period.code} needs at least one direct component.` };
      const componentKeys = period.components.map((component) => component.componentClientKey);
      if (new Set(componentKeys).size !== componentKeys.length) return { error: `${period.code} includes the same component more than once.` };
      let total = 0;
      for (const component of period.components) {
        const target = byClientKey.get(component.componentClientKey);
        if (!target || target.calculationMode !== "direct") return { error: `${period.code} may contain only direct periods from this course.` };
        if (!Number.isFinite(component.weightPercent) || component.weightPercent <= 0 || component.weightPercent > 100) {
          return { error: `${period.code} component weights must be greater than 0% and no more than 100%.` };
        }
        total += component.weightPercent;
      }
      if (Math.abs(total - 100) > 0.005) return { error: `${period.code} component weights must total 100%. They currently total ${total.toFixed(1)}%.` };
    }

    const idByClientKey = new Map<string, string>();
    for (const period of periods) idByClientKey.set(period.clientKey, period.id ?? randomUUID());

    const periodRows = periods.map((period, index) => ({
      id: idByClientKey.get(period.clientKey),
      code: period.code,
      name: period.name,
      calculation_mode: period.calculationMode,
      period_role: period.calculationMode === "composite" ? "standard" : period.periodRole,
      sort_order: (index + 1) * 10,
    }));

    const directOrder = new Map(
      periods.filter((period) => period.calculationMode === "direct").map((period, index) => [period.clientKey, index]),
    );
    const componentRows = periods.flatMap((period) => {
      if (period.calculationMode !== "composite") return [];
      const ordered = [...period.components].sort((a, b) => (directOrder.get(a.componentClientKey) ?? 0) - (directOrder.get(b.componentClientKey) ?? 0));
      return ordered.map((component, index) => ({
        parent_period_id: idByClientKey.get(period.clientKey),
        component_period_id: idByClientKey.get(component.componentClientKey),
        weight: component.weightPercent / 100,
        sort_order: (index + 1) * 10,
      }));
    });

    const { error: saveError } = await supabase.rpc("save_grading_period_settings", {
      p_section_id: sectionId,
      p_periods: periodRows,
      p_components: componentRows,
    });
    if (saveError) throw saveError;

    revalidatePeriodPaths();
    return { success: "Grading periods saved. Grade calculations now use this period structure." };
  } catch (error) {
    console.error("Save grading periods failed", error);
    return { error: error instanceof Error ? error.message : "Could not save grading periods." };
  }
}
