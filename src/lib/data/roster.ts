import { createClient } from "@/lib/supabase/server";

export type RosterFilter = "active" | "inactive" | "all";
export type RosterStudent = { enrollmentId:string; studentId:string; displayName:string; email:string|null; externalStudentKey:string|null; active:boolean; enrolledOn:string; exitedOn:string|null; accountLinked:boolean };

export async function getSectionRoster(sectionId: string, filter: RosterFilter = "active"): Promise<RosterStudent[]> {
  const supabase = await createClient();
  let enrollmentQuery = supabase.from("enrollments").select("id,student_id,active,enrolled_on,exited_on").eq("section_id", sectionId).order("active", { ascending: false }).order("enrolled_on", { ascending: true });
  if (filter === "active") enrollmentQuery = enrollmentQuery.eq("active", true);
  if (filter === "inactive") enrollmentQuery = enrollmentQuery.eq("active", false);
  const { data: enrollments, error: enrollmentError } = await enrollmentQuery;
  if (enrollmentError || !enrollments?.length) return [];

  const studentIds = [...new Set(enrollments.map((enrollment) => enrollment.student_id))];
  const [{ data: students, error: studentError }, { data: accounts, error: accountError }] = await Promise.all([
    supabase.from("students").select("id,display_name,school_email,external_student_key").in("id", studentIds),
    supabase.from("student_accounts").select("student_id").in("student_id", studentIds),
  ]);
  if (studentError || accountError || !students) return [];

  const studentsById = new Map(students.map((student) => [student.id, student]));
  const linkedStudentIds = new Set((accounts ?? []).map((account) => account.student_id));
  return enrollments.flatMap((enrollment) => {
    const student = studentsById.get(enrollment.student_id);
    return student ? [{
      enrollmentId:enrollment.id,
      studentId:enrollment.student_id,
      displayName:student.display_name,
      email:student.school_email,
      externalStudentKey:student.external_student_key,
      active:enrollment.active,
      enrolledOn:enrollment.enrolled_on,
      exitedOn:enrollment.exited_on,
      accountLinked:linkedStudentIds.has(enrollment.student_id),
    }] : [];
  }).sort((a,b) => a.displayName.localeCompare(b.displayName));
}
