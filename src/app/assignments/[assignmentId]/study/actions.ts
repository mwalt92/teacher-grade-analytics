"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

const RESOURCE_TYPES = new Set(["skill_practice", "notes", "practice", "solutions", "worksheet", "video", "reference", "other"]);
const AVAILABILITY_RULES = new Set(["always", "after_first_attempt", "retake_preparation", "teacher_only"]);
const ALIGNMENT_KINDS = new Set(["direct", "supporting", "prerequisite"]);

function studyPath(assignmentId: string, values: Record<string, string> = {}) {
  const url = new URL(`/assignments/${assignmentId}/study`, "https://teacher-grade-analytics.local");
  for (const [key, value] of Object.entries(values)) url.searchParams.set(key, value);
  return `${url.pathname}${url.search}`;
}

function cleanOptional(value: FormDataEntryValue | null) {
  const text = String(value ?? "").trim();
  return text || null;
}

async function requireTeacherAssignment(assignmentId: string) {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (typeof userId !== "string") redirect("/login");

  const { data: assignment } = await supabase
    .from("assignments")
    .select("id,section_id,link_group_id,title,study_guide_id")
    .eq("id", assignmentId)
    .maybeSingle();
  if (!assignment) throw new Error("Assignment not found.");

  const [{ data: teacherSection }, { data: section }] = await Promise.all([
    supabase.from("teacher_sections").select("section_id").eq("teacher_id", userId).eq("section_id", assignment.section_id).maybeSingle(),
    supabase.from("sections").select("id,offering_id,course_id").eq("id", assignment.section_id).maybeSingle(),
  ]);
  if (!teacherSection || !section?.offering_id || !section.course_id) throw new Error("You do not have access to this assignment.");

  return { supabase, userId, assignment, offeringId: section.offering_id, courseId: section.course_id };
}

async function requireTeacherGuide(assignmentId: string, guideId: string) {
  const context = await requireTeacherAssignment(assignmentId);
  const { data: guide } = await context.supabase
    .from("study_guides")
    .select("id,offering_id,title")
    .eq("id", guideId)
    .eq("offering_id", context.offeringId)
    .maybeSingle();
  if (!guide) throw new Error("Study guide not found.");
  return { ...context, guide };
}

async function nextResourceOrder(supabase: Awaited<ReturnType<typeof createClient>>, guideId: string) {
  const { data } = await supabase.from("study_guide_resources").select("sort_order").eq("guide_id", guideId).order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

async function nextSkillOrder(supabase: Awaited<ReturnType<typeof createClient>>, guideId: string) {
  const { data } = await supabase.from("study_guide_skills").select("sort_order").eq("guide_id", guideId).order("sort_order", { ascending: false }).limit(1);
  return (data?.[0]?.sort_order ?? 0) + 10;
}

function revalidateStudyViews(assignmentId: string) {
  revalidatePath(`/assignments/${assignmentId}`);
  revalidatePath(`/assignments/${assignmentId}/edit`);
  revalidatePath(`/assignments/${assignmentId}/study`);
  revalidatePath("/student");
  revalidatePath("/student/preview");
}

export async function createStudyGuide(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  if (!assignmentId) redirect("/assignments");
  const { supabase, userId, assignment, offeringId } = await requireTeacherAssignment(assignmentId);
  if (assignment.study_guide_id) redirect(studyPath(assignmentId, { notice: "Guide already exists." }));

  const title = `${assignment.title} Study / Retake Preparation`;
  const { data: guide, error } = await supabase
    .from("study_guides")
    .insert({ offering_id: offeringId, title, student_visible: false, created_by: userId })
    .select("id")
    .single();
  if (error || !guide) redirect(studyPath(assignmentId, { error: "Could not create the study guide." }));

  let targetIds = [assignment.id];
  if (assignment.link_group_id) {
    const { data: linked } = await supabase.from("assignments").select("id").eq("link_group_id", assignment.link_group_id);
    if (linked?.length) targetIds = linked.map((item) => item.id);
  }
  const { error: attachError } = await supabase.from("assignments").update({ study_guide_id: guide.id }).in("id", targetIds);
  if (attachError) redirect(studyPath(assignmentId, { error: "The guide was created, but it could not be attached to the linked assignments." }));

  for (const id of targetIds) revalidateStudyViews(id);
  redirect(studyPath(assignmentId, { notice: `Study guide created and attached to ${targetIds.length} assignment${targetIds.length === 1 ? "" : "s"}.` }));
}

export async function updateStudyGuideDetails(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const description = cleanOptional(formData.get("description"));
  const studentVisible = String(formData.get("studentVisible") ?? "") === "true";
  if (!assignmentId || !guideId || !title) redirect(studyPath(assignmentId || "unknown", { error: "A study guide title is required." }));

  const { supabase } = await requireTeacherGuide(assignmentId, guideId);
  const { error } = await supabase.from("study_guides").update({ title, description, student_visible: studentVisible, updated_at: new Date().toISOString() }).eq("id", guideId);
  if (error) redirect(studyPath(assignmentId, { error: "Could not save the study guide settings." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: studentVisible ? "Study guide saved and visible to students." : "Study guide saved as teacher-only draft." }));
}

export async function createStudySkill(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const code = cleanOptional(formData.get("code"));
  const description = cleanOptional(formData.get("description"));
  if (!assignmentId || !guideId || !title) redirect(studyPath(assignmentId || "unknown", { error: "Enter a skill title." }));

  const { supabase, userId, courseId } = await requireTeacherGuide(assignmentId, guideId);
  const { data: skill, error } = await supabase
    .from("study_skills")
    .insert({ course_id: courseId, code, title, description, created_by: userId })
    .select("id")
    .single();
  if (error || !skill) redirect(studyPath(assignmentId, { error: code ? "Could not create that skill. Its code may already exist." : "Could not create that skill." }));

  const sortOrder = await nextSkillOrder(supabase, guideId);
  const { error: attachError } = await supabase.from("study_guide_skills").insert({ guide_id: guideId, skill_id: skill.id, sort_order: sortOrder });
  if (attachError) redirect(studyPath(assignmentId, { error: "The skill was created but could not be attached to this guide." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Skill created and added to this study guide." }));
}

export async function attachExistingSkill(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const skillId = String(formData.get("skillId") ?? "");
  if (!assignmentId || !guideId || !skillId) redirect(studyPath(assignmentId || "unknown", { error: "Choose a skill to attach." }));
  const { supabase, courseId } = await requireTeacherGuide(assignmentId, guideId);
  const { data: skill } = await supabase.from("study_skills").select("id").eq("id", skillId).eq("course_id", courseId).maybeSingle();
  if (!skill) redirect(studyPath(assignmentId, { error: "That skill does not belong to this course." }));
  const sortOrder = await nextSkillOrder(supabase, guideId);
  const { error } = await supabase.from("study_guide_skills").upsert({ guide_id: guideId, skill_id: skillId, sort_order: sortOrder }, { onConflict: "guide_id,skill_id", ignoreDuplicates: true });
  if (error) redirect(studyPath(assignmentId, { error: "Could not attach that skill." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Existing skill added to this study guide." }));
}

export async function removeStudySkill(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const skillId = String(formData.get("skillId") ?? "");
  if (!assignmentId || !guideId || !skillId) redirect("/assignments");
  const { supabase } = await requireTeacherGuide(assignmentId, guideId);
  const { error } = await supabase.from("study_guide_skills").delete().eq("guide_id", guideId).eq("skill_id", skillId);
  if (error) redirect(studyPath(assignmentId, { error: "Could not remove that skill from the guide." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Skill removed from this guide. The reusable course skill was preserved." }));
}

export async function createStudyResource(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const providerId = String(formData.get("providerId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const url = cleanOptional(formData.get("url"));
  const description = cleanOptional(formData.get("description"));
  const externalCode = cleanOptional(formData.get("externalCode"));
  const skillId = cleanOptional(formData.get("skillId"));
  const teacherNote = cleanOptional(formData.get("teacherNote"));
  const resourceType = String(formData.get("resourceType") ?? "reference");
  const availabilityRule = String(formData.get("availabilityRule") ?? "always");
  const alignmentKind = String(formData.get("alignmentKind") ?? "direct");
  const featured = String(formData.get("featured") ?? "") === "true";
  if (!assignmentId || !guideId || !providerId || !title) redirect(studyPath(assignmentId || "unknown", { error: "Provider and resource title are required." }));
  if (!RESOURCE_TYPES.has(resourceType) || !AVAILABILITY_RULES.has(availabilityRule) || !ALIGNMENT_KINDS.has(alignmentKind)) redirect(studyPath(assignmentId, { error: "Choose valid resource settings." }));

  const { supabase, userId, courseId } = await requireTeacherGuide(assignmentId, guideId);
  const { data: provider } = await supabase.from("resource_providers").select("id").eq("id", providerId).eq("active", true).maybeSingle();
  if (!provider) redirect(studyPath(assignmentId, { error: "Choose an active resource provider." }));
  if (skillId) {
    const { data: skill } = await supabase.from("study_skills").select("id").eq("id", skillId).eq("course_id", courseId).maybeSingle();
    if (!skill) redirect(studyPath(assignmentId, { error: "Choose a skill from this course." }));
  }

  const { data: resource, error } = await supabase
    .from("study_resources")
    .insert({ provider_id: providerId, title, description, url, external_code: externalCode, resource_type: resourceType, created_by: userId })
    .select("id")
    .single();
  if (error || !resource) redirect(studyPath(assignmentId, { error: "Could not create that resource." }));

  if (skillId) {
    await supabase.from("study_resource_skills").upsert({ resource_id: resource.id, skill_id: skillId, alignment_kind: alignmentKind }, { onConflict: "resource_id,skill_id" });
    const skillOrder = await nextSkillOrder(supabase, guideId);
    await supabase.from("study_guide_skills").upsert({ guide_id: guideId, skill_id: skillId, sort_order: skillOrder }, { onConflict: "guide_id,skill_id", ignoreDuplicates: true });
  }
  const sortOrder = await nextResourceOrder(supabase, guideId);
  const { error: attachError } = await supabase.from("study_guide_resources").insert({ guide_id: guideId, resource_id: resource.id, skill_id: skillId, sort_order: sortOrder, teacher_note: teacherNote, availability_rule: availabilityRule, featured });
  if (attachError) redirect(studyPath(assignmentId, { error: "The resource was created but could not be attached to this guide." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Resource created and added to this study guide." }));
}

export async function attachExistingResource(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const resourceId = String(formData.get("resourceId") ?? "");
  const skillId = cleanOptional(formData.get("skillId"));
  const availabilityRule = String(formData.get("availabilityRule") ?? "always");
  if (!assignmentId || !guideId || !resourceId || !AVAILABILITY_RULES.has(availabilityRule)) redirect(studyPath(assignmentId || "unknown", { error: "Choose a resource and release rule." }));
  const { supabase, courseId } = await requireTeacherGuide(assignmentId, guideId);
  const { data: resource } = await supabase.from("study_resources").select("id").eq("id", resourceId).eq("active", true).maybeSingle();
  if (!resource) redirect(studyPath(assignmentId, { error: "That resource is not available." }));
  if (skillId) {
    const { data: skill } = await supabase.from("study_skills").select("id").eq("id", skillId).eq("course_id", courseId).maybeSingle();
    if (!skill) redirect(studyPath(assignmentId, { error: "Choose a skill from this course." }));
    const skillOrder = await nextSkillOrder(supabase, guideId);
    await supabase.from("study_guide_skills").upsert({ guide_id: guideId, skill_id: skillId, sort_order: skillOrder }, { onConflict: "guide_id,skill_id", ignoreDuplicates: true });
  }
  const sortOrder = await nextResourceOrder(supabase, guideId);
  const { error } = await supabase.from("study_guide_resources").insert({ guide_id: guideId, resource_id: resourceId, skill_id: skillId, sort_order: sortOrder, availability_rule: availabilityRule });
  if (error) redirect(studyPath(assignmentId, { error: "Could not add that resource to this guide." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Existing library resource added to this guide." }));
}

export async function updateGuideResource(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const availabilityRule = String(formData.get("availabilityRule") ?? "always");
  const teacherNote = cleanOptional(formData.get("teacherNote"));
  const featured = String(formData.get("featured") ?? "") === "true";
  if (!assignmentId || !guideId || !itemId || !AVAILABILITY_RULES.has(availabilityRule)) redirect("/assignments");
  const { supabase } = await requireTeacherGuide(assignmentId, guideId);
  const { error } = await supabase.from("study_guide_resources").update({ availability_rule: availabilityRule, teacher_note: teacherNote, featured }).eq("id", itemId).eq("guide_id", guideId);
  if (error) redirect(studyPath(assignmentId, { error: "Could not update that resource." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Resource settings updated." }));
}

export async function removeGuideResource(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!assignmentId || !guideId || !itemId) redirect("/assignments");
  const { supabase } = await requireTeacherGuide(assignmentId, guideId);
  const { error } = await supabase.from("study_guide_resources").delete().eq("id", itemId).eq("guide_id", guideId);
  if (error) redirect(studyPath(assignmentId, { error: "Could not remove that resource from this guide." }));
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId, { notice: "Resource removed from this guide. The library copy was preserved." }));
}

export async function moveGuideResource(formData: FormData) {
  const assignmentId = String(formData.get("assignmentId") ?? "");
  const guideId = String(formData.get("guideId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  const direction = String(formData.get("direction") ?? "");
  if (!assignmentId || !guideId || !itemId || !["up", "down"].includes(direction)) redirect("/assignments");
  const { supabase } = await requireTeacherGuide(assignmentId, guideId);
  const { data: items } = await supabase.from("study_guide_resources").select("id,sort_order").eq("guide_id", guideId).order("sort_order", { ascending: true }).order("created_at", { ascending: true });
  const index = (items ?? []).findIndex((item) => item.id === itemId);
  const swapIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || swapIndex < 0 || swapIndex >= (items ?? []).length) redirect(studyPath(assignmentId));
  const current = items![index];
  const other = items![swapIndex];
  const tempOrder = Math.max(current.sort_order, other.sort_order) + 1000000;
  await supabase.from("study_guide_resources").update({ sort_order: tempOrder }).eq("id", current.id);
  await supabase.from("study_guide_resources").update({ sort_order: current.sort_order }).eq("id", other.id);
  await supabase.from("study_guide_resources").update({ sort_order: other.sort_order }).eq("id", current.id);
  revalidateStudyViews(assignmentId);
  redirect(studyPath(assignmentId));
}
