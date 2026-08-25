import type {
  GradeAttempt,
  GradeRecord,
  GradeResult,
  GradingCategory,
  GradingRules,
  SemesterComponent,
  SemesterGradeResult,
} from "./types";

function percent(attempt: GradeAttempt) {
  if (attempt.possible <= 0) throw new Error("Points possible must be greater than zero.");
  return (attempt.earned / attempt.possible) * 100;
}

function toAttemptAudit(attempt: GradeAttempt, counted: boolean) {
  return {
    attemptId: attempt.id,
    attemptNumber: attempt.attemptNumber,
    earned: attempt.earned,
    possible: attempt.possible,
    percent: percent(attempt),
    counted,
  };
}

function compareAttemptsForHighest(a: GradeAttempt, b: GradeAttempt) {
  const percentDifference = percent(b) - percent(a);
  if (percentDifference !== 0) return percentDifference;
  return a.attemptNumber - b.attemptNumber;
}

export function selectCountedAttempt(
  record: GradeRecord,
  policy: GradingRules["retakePolicy"],
): GradeAttempt | null {
  if (record.attempts.length === 0) return null;

  if (policy === "latest") {
    return [...record.attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
  }

  // Highest percentage wins. Exact ties deliberately use the earliest attempt number.
  return [...record.attempts].sort(compareAttemptsForHighest)[0];
}

export function calculateGrade(records: GradeRecord[], rules: GradingRules): GradeResult {
  const byCategory = new Map<GradingCategory, { record: GradeRecord; countedAttempt: GradeAttempt | null; percent: number }[]>();
  const audit: GradeResult["audit"] = [];

  for (const record of records) {
    if (record.exempt) {
      audit.push({
        assignmentId: record.assignmentId,
        assignmentTitle: record.assignmentTitle,
        assignmentDate: record.assignmentDate,
        gradingPeriodCode: record.gradingPeriodCode,
        category: record.category,
        status: "exempt",
        percent: null,
        countedAttemptId: null,
        countedAttemptNumber: null,
        dropped: false,
        missing: record.missing,
        exempt: true,
        attempts: record.attempts.map((attempt) => toAttemptAudit(attempt, false)),
      });
      continue;
    }

    const countedAttempt = selectCountedAttempt(record, rules.retakePolicy);
    const countedPercent = countedAttempt ? percent(countedAttempt) : record.missing ? 0 : null;

    if (countedPercent === null) {
      audit.push({
        assignmentId: record.assignmentId,
        assignmentTitle: record.assignmentTitle,
        assignmentDate: record.assignmentDate,
        gradingPeriodCode: record.gradingPeriodCode,
        category: record.category,
        status: "unentered",
        percent: null,
        countedAttemptId: null,
        countedAttemptNumber: null,
        dropped: false,
        missing: false,
        exempt: false,
        attempts: [],
      });
      continue;
    }

    const list = byCategory.get(record.category) ?? [];
    list.push({ record, countedAttempt, percent: countedPercent });
    byCategory.set(record.category, list);
  }

  const categoryPercents: GradeResult["categoryPercents"] = {};
  const categories: GradeResult["categories"] = {};
  let weightedTotal = 0;
  let activeWeight = 0;

  for (const [category, entries] of byCategory.entries()) {
    const dropCount = Math.min(rules.dropLowest[category] ?? 0, Math.max(entries.length - 1, 0));
    const ordered = [...entries].sort((a, b) => {
      const percentDifference = a.percent - b.percent;
      if (percentDifference !== 0) return percentDifference;
      const dateDifference = (a.record.assignmentDate ?? "").localeCompare(b.record.assignmentDate ?? "");
      if (dateDifference !== 0) return dateDifference;
      return a.record.assignmentId.localeCompare(b.record.assignmentId);
    });
    const droppedIds = new Set(ordered.slice(0, dropCount).map((entry) => entry.record.assignmentId));
    const countedEntries = entries.filter((entry) => !droppedIds.has(entry.record.assignmentId));
    const average = countedEntries.reduce((sum, entry) => sum + entry.percent, 0) / countedEntries.length;
    const configuredWeight = rules.categoryWeights[category];

    categoryPercents[category] = average;
    weightedTotal += average * configuredWeight;
    activeWeight += configuredWeight;
    categories[category] = {
      category,
      configuredWeight,
      activeWeight: configuredWeight,
      averagePercent: average,
      weightedContribution: average * configuredWeight,
      assignmentCount: countedEntries.length,
      droppedCount: dropCount,
    };

    for (const entry of entries) {
      const dropped = droppedIds.has(entry.record.assignmentId);
      const selectedId = entry.countedAttempt?.id ?? null;
      audit.push({
        assignmentId: entry.record.assignmentId,
        assignmentTitle: entry.record.assignmentTitle,
        assignmentDate: entry.record.assignmentDate,
        gradingPeriodCode: entry.record.gradingPeriodCode,
        category,
        status: dropped ? "dropped" : entry.record.missing ? "missing" : "counted",
        percent: entry.percent,
        countedAttemptId: selectedId,
        countedAttemptNumber: entry.countedAttempt?.attemptNumber ?? null,
        dropped,
        missing: entry.record.missing,
        exempt: false,
        attempts: entry.record.attempts.map((attempt) =>
          toAttemptAudit(attempt, !dropped && attempt.id === selectedId),
        ),
      });
    }
  }

  return {
    overallPercent: activeWeight === 0 ? null : weightedTotal / activeWeight,
    activeWeight,
    categoryPercents,
    categories,
    audit,
  };
}

export function calculateSemesterGrade(components: SemesterComponent[]): SemesterGradeResult {
  let weightedTotal = 0;
  let activeWeight = 0;

  const results = components.map((component) => {
    const isActive = component.percent !== null;
    const componentActiveWeight = isActive ? component.weight : 0;
    const weightedContribution = isActive ? component.percent! * component.weight : 0;
    weightedTotal += weightedContribution;
    activeWeight += componentActiveWeight;
    return { ...component, activeWeight: componentActiveWeight, weightedContribution };
  });

  return {
    overallPercent: activeWeight === 0 ? null : weightedTotal / activeWeight,
    activeWeight,
    components: results,
  };
}
