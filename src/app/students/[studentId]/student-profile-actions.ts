"use server";

import { createClient } from "@/lib/supabase/server";

export async function getRetakeEligibility(assignmentIds: string[]) {
  const ids = [...new Set(assignmentIds.filter(Boolean))];
  if (!ids.length) return {} as Record<string, boolean>;

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") return {} as Record<string, boolean>;

  const { data: assignments, error: assignmentError } = await supabase
    .from("assignments")
    .select("id,section_id,allow_retakes,archived")
    .in("id", ids);
  if (assignmentError || !assignments?.length) return {} as Record<string, boolean>;

  const sectionIds = [...new Set(assignments.map((assignment) => assignment.section_id))];
  const { data: teacherSections, error: teacherSectionError } = await supabase
    .from("teacher_sections")
    .select("section_id")
    .eq("teacher_id", userId)
    .in("section_id", sectionIds);
  if (teacherSectionError) return {} as Record<string, boolean>;

  const allowedSections = new Set((teacherSections ?? []).map((row) => row.section_id));
  return Object.fromEntries(assignments.map((assignment) => [
    assignment.id,
    Boolean(assignment.allow_retakes && !assignment.archived && allowedSections.has(assignment.section_id)),
  ]));
}
