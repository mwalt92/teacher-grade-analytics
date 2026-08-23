import { createClient } from "@/lib/supabase/server";

export type RosterFilter = "active" | "inactive" | "all";

export type RosterStudent = {
  enrollmentId: string;
  studentId: string;
  displayName: string;
  email: string;
  active: boolean;
  enrolledOn: string;
  exitedOn: string | null;
};

export async function getSectionRoster(sectionId: string, filter: RosterFilter = "active"): Promise<RosterStudent[]> {
  const supabase = await createClient();

  let enrollmentQuery = supabase
    .from("enrollments")
    .select("id,student_id,active,enrolled_on,exited_on")
    .eq("section_id", sectionId)
    .order("active", { ascending: false })
    .order("enrolled_on", { ascending: true });

  if (filter === "active") enrollmentQuery = enrollmentQuery.eq("active", true);
  if (filter === "inactive") enrollmentQuery = enrollmentQuery.eq("active", false);

  const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError || !enrollments?.length) return [];

  const studentIds = enrollments.map((enrollment) => enrollment.student_id);
  const { data: profiles, error: profileError } = await supabase
    .from("profiles")
    .select("id,display_name,email")
    .in("id", studentIds);

  if (profileError || !profiles) return [];

  const profilesById = new Map(profiles.map((profile) => [profile.id, profile]));

  return enrollments.flatMap((enrollment) => {
    const profile = profilesById.get(enrollment.student_id);
    if (!profile) return [];

    return [{
      enrollmentId: enrollment.id,
      studentId: enrollment.student_id,
      displayName: profile.display_name,
      email: profile.email,
      active: enrollment.active,
      enrolledOn: enrollment.enrolled_on,
      exitedOn: enrollment.exited_on,
    }];
  });
}
