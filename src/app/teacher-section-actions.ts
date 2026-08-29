"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ACTIVE_TEACHER_SECTION_COOKIE, getTeacherSections } from "@/lib/data/teacher-context";

function safeReturnPath(value: FormDataEntryValue | null) {
  const path = typeof value === "string" ? value : "/";
  if (!path.startsWith("/") || path.startsWith("//")) return "/";
  return path;
}

export async function setActiveTeacherSection(formData: FormData) {
  const sectionId = String(formData.get("sectionId") ?? "");
  const returnTo = safeReturnPath(formData.get("returnTo"));
  const sections = await getTeacherSections();
  if (!sections.some((section) => section.sectionId === sectionId)) {
    throw new Error("Choose a section assigned to your teacher account.");
  }

  const cookieStore = await cookies();
  cookieStore.set(ACTIVE_TEACHER_SECTION_COOKIE, sectionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 180,
  });

  redirect(returnTo);
}
