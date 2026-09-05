"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ACTIVE_TEACHER_SECTION_COOKIE } from "@/lib/data/teacher-context";
import { createClient } from "@/lib/supabase/server";

function lifecycleRedirect(view: "active" | "archived", message: string, error = false): never {
  const params = new URLSearchParams({ view, [error ? "error" : "message"]: message });
  redirect(`/settings/courses?${params.toString()}`);
}

export async function setCourseOfferingArchived(formData: FormData) {
  const offeringId = String(formData.get("offeringId") ?? "").trim();
  const archived = String(formData.get("archived") ?? "") === "true";
  if (!offeringId) lifecycleRedirect(archived ? "archived" : "active", "Could not identify that course.", true);

  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/login");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  if (!profile || (profile.role !== "teacher" && profile.role !== "admin")) {
    lifecycleRedirect(archived ? "archived" : "active", "Only teachers can manage course lifecycle.", true);
  }

  const { data: offering, error: offeringError } = await supabase
    .from("course_offerings")
    .select("id,active")
    .eq("id", offeringId)
    .maybeSingle();
  if (offeringError || !offering) lifecycleRedirect(archived ? "archived" : "active", "Course offering not found or unavailable.", true);

  const { data: offeringSections, error: sectionError } = await supabase
    .from("sections")
    .select("id")
    .eq("offering_id", offeringId);
  if (sectionError || !offeringSections?.length) lifecycleRedirect(archived ? "archived" : "active", "This course has no accessible sections.", true);
  const sectionIds = offeringSections.map((section) => section.id);

  const desiredActive = !archived;
  if (Boolean(offering.active) !== desiredActive) {
    const { data: updated, error: updateError } = await supabase.rpc("set_teacher_course_offering_active", {
      p_offering_id: offeringId,
      p_active: desiredActive,
    });
    if (updateError || !updated) lifecycleRedirect(archived ? "archived" : "active", updateError?.message ?? "Course lifecycle update was not applied.", true);
  }

  if (archived) {
    const cookieStore = await cookies();
    const selectedSectionId = cookieStore.get(ACTIVE_TEACHER_SECTION_COOKIE)?.value;
    if (selectedSectionId && sectionIds.includes(selectedSectionId)) cookieStore.delete(ACTIVE_TEACHER_SECTION_COOKIE);
  }

  revalidatePath("/");
  revalidatePath("/dashboard");
  revalidatePath("/settings");
  revalidatePath("/settings/courses");
  revalidatePath("/settings/course-setup");

  lifecycleRedirect(archived ? "archived" : "active", archived
    ? "Course archived. All sections, rosters, assignments, grades, and history were preserved."
    : "Course restored to active teaching workflows.");
}
