import type { GradingCategory } from "./types";

export type LateWorkPolicy = {
  deductionRate: number;
};

export type LateWorkRules = Record<GradingCategory, LateWorkPolicy>;

export const defaultLateWorkRules: LateWorkRules = {
  participation: { deductionRate: 0.5 },
  quiz: { deductionRate: 0 },
  test: { deductionRate: 0 },
};

export function applyLateDeduction(percent: number, deductionRate: number) {
  if (deductionRate < 0 || deductionRate > 1) {
    throw new Error("Late deduction must be between 0 and 1.");
  }

  return percent * (1 - deductionRate);
}
