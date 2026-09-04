"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { discoverPowerSchoolTeacher, getPowerSchoolConfigStatus, type PowerSchoolTeacherSection } from "@/lib/powerschool/client";
import { createClient } from "@/lib/supabase/server";

export type PowerSchoolProbeState = {
  status: "idle" | "success" | "warning" | "error";
  message: string;
  teacherName: string | null;
  sections: PowerSchoolTeacherSection[];
  testedAt: string | null;
};

async function appendConnectionEvent(
  teacherId: string,
  phase: "verified_after" | "warning" | "error",
  summary: string,
  payload: Record<string, string | number | boolean | null>,
) {
  const supabase = await createClient();
  await supabase.from("powerschool_sync_events").insert({
    operation_id: randomUUID(),
    teacher_id: teacherId,
    resource_type: "connection",
    operation_type: "verify",
    phase,
    payload,
    summary,
  });
  revalidatePath("/settings/powerschool");
}

export async function testPowerSchoolConnection(
  _previousState: PowerSchoolProbeState,
  _formData: FormData,
): Promise<PowerSchoolProbeState> {
  const testedAt = new Date().toISOString();
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return { status: "error", message: "Your session expired. Sign in again before testing PowerSchool.", teacherName: null, sections: [], testedAt };
  }

  const { data: profile, error: profileError } = await supabase
    .from("profiles")
    .select("email,display_name,role")
    .eq("id", userId)
    .maybeSingle();
  if (profileError || !profile || (profile.role !== "teacher" && profile.role !== "admin")) {
    return { status: "error", message: "Only a teacher account can test the PowerSchool connector.", teacherName: null, sections: [], testedAt };
  }

  const config = getPowerSchoolConfigStatus();
  if (!config.configured) {
    return {
      status: "warning",
      message: `PowerSchool is not configured yet. Missing server settings: ${config.missing.join(", ")}.`,
      teacherName: null,
      sections: [],
      testedAt,
    };
  }

  try {
    const discovery = await discoverPowerSchoolTeacher(profile.email);
    const rosterCount = discovery.sections.reduce((sum, section) => sum + section.rosterCount, 0);

    if (!discovery.sections.length) {
      const message = "OAuth succeeded, but no PowerSchool sections matched this teacher account's email. No district-wide fallback query was attempted.";
      await appendConnectionEvent(userId, "warning", message, {
        connection_ok: true,
        section_count: 0,
        powerschool_host: config.host,
      });
      return { status: "warning", message, teacherName: discovery.teacherName, sections: [], testedAt };
    }

    const message = `Read-only PowerSchool connection verified. Found ${discovery.sections.length} teacher section${discovery.sections.length === 1 ? "" : "s"} and ${rosterCount} roster record${rosterCount === 1 ? "" : "s"}.`;
    await appendConnectionEvent(userId, "verified_after", message, {
      connection_ok: true,
      section_count: discovery.sections.length,
      roster_count: rosterCount,
      powerschool_host: config.host,
    });

    return {
      status: "success",
      message,
      teacherName: discovery.teacherName ?? profile.display_name,
      sections: discovery.sections,
      testedAt,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "PowerSchool connection test failed.";
    await appendConnectionEvent(userId, "error", message, {
      connection_ok: false,
      powerschool_host: config.host,
    });
    return { status: "error", message, teacherName: null, sections: [], testedAt };
  }
}
