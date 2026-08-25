import { createClient } from "@/lib/supabase/server";

export const POWERSCHOOL_TOLERANCE = 0.1;

export type PowerSchoolSnapshot = {
  id: string;
  studentId: string;
  gradingPeriodId: string | null;
  capturedAt: string;
  powerSchoolPercent: number;
  websitePercent: number;
  note: string | null;
};

export function powerSchoolDifference(snapshot: PowerSchoolSnapshot) {
  return snapshot.websitePercent - snapshot.powerSchoolPercent;
}

export function isPowerSchoolMismatch(snapshot: PowerSchoolSnapshot, tolerance = POWERSCHOOL_TOLERANCE) {
  return Math.abs(powerSchoolDifference(snapshot)) >= tolerance;
}

export async function getLatestPowerSchoolSnapshots(
  sectionId: string,
  gradingPeriodId: string,
  studentIds: string[],
): Promise<PowerSchoolSnapshot[]> {
  if (studentIds.length === 0) return [];

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("power_school_snapshots")
    .select("id,student_id,grading_period_id,captured_at,powerschool_percent,website_percent,note")
    .eq("section_id", sectionId)
    .eq("grading_period_id", gradingPeriodId)
    .in("student_id", studentIds)
    .order("captured_at", { ascending: false });

  if (error || !data) return [];

  const latestByStudent = new Map<string, PowerSchoolSnapshot>();
  for (const row of data) {
    if (latestByStudent.has(row.student_id)) continue;
    latestByStudent.set(row.student_id, {
      id: row.id,
      studentId: row.student_id,
      gradingPeriodId: row.grading_period_id,
      capturedAt: row.captured_at,
      powerSchoolPercent: Number(row.powerschool_percent),
      websitePercent: Number(row.website_percent),
      note: row.note,
    });
  }

  return [...latestByStudent.values()];
}
