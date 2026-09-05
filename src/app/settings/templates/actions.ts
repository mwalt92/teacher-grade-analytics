"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { rpcUntyped } from "@/lib/supabase/untyped-rpc";

function text(formData: FormData, key: string, maxLength: number) {
  return String(formData.get(key) ?? "").trim().slice(0, maxLength);
}

function templateRedirect(message: string, error = false): never {
  const params = new URLSearchParams({ [error ? "error" : "message"]: message });
  redirect(`/settings/templates?${params.toString()}`);
}

export async function saveCourseTemplate(formData: FormData) {
  const sourceOfferingId = text(formData, "sourceOfferingId", 100);
  const name = text(formData, "name", 120);
  const description = text(formData, "description", 500);
  if (!sourceOfferingId) templateRedirect("Choose a source course for the template.", true);
  if (!name) templateRedirect("Enter a template name.", true);

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { error } = await rpcUntyped<string>(supabase, "save_teacher_course_template", {
    p_source_offering_id: sourceOfferingId,
    p_name: name,
    p_description: description || null,
    p_template_id: null,
  });
  if (error) templateRedirect(error.message, true);

  revalidatePath("/settings/templates");
  revalidatePath("/settings/course-setup");
  templateRedirect(`${name} saved as an independent configuration snapshot.`);
}

export async function deleteCourseTemplate(formData: FormData) {
  const templateId = text(formData, "templateId", 100);
  if (!templateId) templateRedirect("Could not identify that template.", true);

  const supabase = await createClient();
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") redirect("/login");

  const { data: deleted, error } = await rpcUntyped<boolean>(supabase, "delete_teacher_course_template", {
    p_template_id: templateId,
  });
  if (error) templateRedirect(error.message, true);
  if (!deleted) templateRedirect("Template not found or unavailable.", true);

  revalidatePath("/settings/templates");
  revalidatePath("/settings/course-setup");
  templateRedirect("Template deleted. Courses previously created from it were not changed.");
}
