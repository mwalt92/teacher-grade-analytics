import { createClient } from "@/lib/supabase/server";

export type AssignmentManagementPeriod = { id: string; code: string; name: string };
export type AssignmentManagementCategory = { id: string; name: string };
export type AssignmentManagementType = { id: string; code: string; name: string; active: boolean };

export type AssignmentManagementRow = {
  id: string;
  title: string;
  assignmentType: AssignmentManagementType | null;
  assignmentDate: string;
  pointsPossible: number;
  allowRetakes: boolean;
  archived: boolean;
  archivedAt: string | null;
  gradingPeriod: AssignmentManagementPeriod | null;
  category: AssignmentManagementCategory | null;
  gradeRecordCount: number;
  scoredCount: number;
  missingCount: number;
  retakeCount: number;
};

export type AssignmentManagementData = {
  assignments: AssignmentManagementRow[];
  periods: AssignmentManagementPeriod[];
  categories: AssignmentManagementCategory[];
  assignmentTypes: AssignmentManagementType[];
};

function legacyTypeLabel(code: string) {
  return code.split("_").map((part) => part ? `${part[0].toUpperCase()}${part.slice(1)}` : part).join(" ");
}

export async function getAssignmentManagementData(sectionId: string): Promise<AssignmentManagementData | null> {
  const supabase = await createClient();
  const [assignmentsResult, periodsResult, categoriesResult, typesResult] = await Promise.all([
    supabase
      .from("assignments")
      .select("id,title,assignment_type,assignment_type_id,assignment_date,points_possible,allow_retakes,archived,archived_at,grading_period_id,category_id,created_at")
      .eq("section_id", sectionId)
      .order("assignment_date", { ascending: false })
      .order("created_at", { ascending: false }),
    supabase.from("grading_periods").select("id,code,name,sort_order").eq("section_id", sectionId).eq("calculation_mode", "direct").order("sort_order").order("code"),
    supabase.from("grading_categories").select("id,name").eq("section_id", sectionId),
    supabase.from("assignment_types").select("id,code,name,active,sort_order").eq("section_id", sectionId).order("sort_order").order("name"),
  ]);

  if (assignmentsResult.error || periodsResult.error || categoriesResult.error || typesResult.error) return null;
  const assignments = assignmentsResult.data ?? [];
  const periods: AssignmentManagementPeriod[] = (periodsResult.data ?? []).map((period) => ({ id: period.id, code: period.code, name: period.name }));
  const categories = categoriesResult.data ?? [];
  const assignmentTypes: AssignmentManagementType[] = (typesResult.data ?? []).map((type) => ({
    id: type.id,
    code: type.code,
    name: type.name,
    active: Boolean(type.active),
  }));

  const periodById = new Map(periods.map((period) => [period.id, period]));
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const typeById = new Map(assignmentTypes.map((type) => [type.id, type]));
  const assignmentIds = assignments.map((assignment) => assignment.id);

  let gradeRows: { id: string; assignment_id: string; missing: boolean }[] = [];
  if (assignmentIds.length > 0) {
    const { data, error } = await supabase
      .from("grade_records")
      .select("id,assignment_id,missing")
      .in("assignment_id", assignmentIds);
    if (error) return null;
    gradeRows = data ?? [];
  }

  const gradeRecordIds = gradeRows.map((row) => row.id);
  let attempts: { grade_record_id: string; attempt_number: number }[] = [];
  if (gradeRecordIds.length > 0) {
    const { data, error } = await supabase
      .from("grade_attempts")
      .select("grade_record_id,attempt_number")
      .in("grade_record_id", gradeRecordIds);
    if (error) return null;
    attempts = data ?? [];
  }

  const rowsByAssignment = new Map<string, typeof gradeRows>();
  for (const row of gradeRows) {
    const list = rowsByAssignment.get(row.assignment_id) ?? [];
    list.push(row);
    rowsByAssignment.set(row.assignment_id, list);
  }

  const attemptsByRecord = new Map<string, typeof attempts>();
  for (const attempt of attempts) {
    const list = attemptsByRecord.get(attempt.grade_record_id) ?? [];
    list.push(attempt);
    attemptsByRecord.set(attempt.grade_record_id, list);
  }

  const normalizedAssignments: AssignmentManagementRow[] = assignments.map((assignment) => {
    const records = rowsByAssignment.get(assignment.id) ?? [];
    let scoredCount = 0;
    let retakeCount = 0;
    for (const record of records) {
      const recordAttempts = attemptsByRecord.get(record.id) ?? [];
      if (recordAttempts.length > 0) scoredCount += 1;
      retakeCount += recordAttempts.filter((attempt) => attempt.attempt_number > 1).length;
    }

    const configuredType = assignment.assignment_type_id ? typeById.get(assignment.assignment_type_id) ?? null : null;
    const assignmentType = configuredType ?? (assignment.assignment_type ? {
      id: `legacy:${assignment.assignment_type}`,
      code: assignment.assignment_type,
      name: legacyTypeLabel(assignment.assignment_type),
      active: false,
    } : null);

    return {
      id: assignment.id,
      title: assignment.title,
      assignmentType,
      assignmentDate: assignment.assignment_date,
      pointsPossible: Number(assignment.points_possible),
      allowRetakes: Boolean(assignment.allow_retakes),
      archived: Boolean(assignment.archived),
      archivedAt: assignment.archived_at,
      gradingPeriod: assignment.grading_period_id ? periodById.get(assignment.grading_period_id) ?? null : null,
      category: categoryById.get(assignment.category_id) ?? null,
      gradeRecordCount: records.length,
      scoredCount,
      missingCount: records.filter((record) => record.missing).length,
      retakeCount,
    };
  });

  return { assignments: normalizedAssignments, periods, categories, assignmentTypes };
}