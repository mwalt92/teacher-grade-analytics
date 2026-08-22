import type { GradeAttempt, GradeRecord, GradeResult, GradingCategory, GradingRules } from "./types";

function percent(attempt: GradeAttempt) {
  if (attempt.possible <= 0) throw new Error("Points possible must be greater than zero.");
  return (attempt.earned / attempt.possible) * 100;
}

function countedAttempt(record: GradeRecord, policy: GradingRules["retakePolicy"]) {
  if (record.missing && record.attempts.length === 0) return 0;
  if (record.attempts.length === 0) return null;

  if (policy === "latest") {
    const latest = [...record.attempts].sort((a, b) => b.attemptNumber - a.attemptNumber)[0];
    return percent(latest);
  }

  return Math.max(...record.attempts.map(percent));
}

export function calculateGrade(records: GradeRecord[], rules: GradingRules): GradeResult {
  const byCategory = new Map<GradingCategory, { assignmentId: string; percent: number }[]>();

  for (const record of records) {
    const counted = countedAttempt(record, rules.retakePolicy);
    if (counted === null) continue;
    const list = byCategory.get(record.category) ?? [];
    list.push({ assignmentId: record.assignmentId, percent: counted });
    byCategory.set(record.category, list);
  }

  const categoryPercents: GradeResult["categoryPercents"] = {};
  const audit: GradeResult["audit"] = [];
  let weightedTotal = 0;
  let activeWeight = 0;

  for (const [category, entries] of byCategory.entries()) {
    const dropCount = Math.min(rules.dropLowest[category] ?? 0, Math.max(entries.length - 1, 0));
    const ordered = [...entries].sort((a, b) => a.percent - b.percent);
    const droppedIds = new Set(ordered.slice(0, dropCount).map((entry) => entry.assignmentId));
    const counted = entries.filter((entry) => !droppedIds.has(entry.assignmentId));
    const average = counted.reduce((sum, entry) => sum + entry.percent, 0) / counted.length;
    categoryPercents[category] = average;

    for (const entry of entries) {
      audit.push({ assignmentId: entry.assignmentId, category, percent: entry.percent, dropped: droppedIds.has(entry.assignmentId) });
    }

    const weight = rules.categoryWeights[category];
    weightedTotal += average * weight;
    activeWeight += weight;
  }

  return {
    overallPercent: activeWeight === 0 ? null : weightedTotal / activeWeight,
    categoryPercents,
    audit,
  };
}
