import type { CategoryCalculationMethod, GradingCategory, GradingRules } from "./types";

export type GradingCategoryRow = {
  id: string;
  name: string;
  code: string;
  weight: number | string;
  drop_lowest: number | string;
  calculation_method: string;
  sort_order?: number | string;
};

export type CategoryConfig = {
  category: GradingCategory;
  label: string;
  weight: number;
  dropLowest: number;
  calculationMethod: CategoryCalculationMethod;
};

export function normalizeCategoryCode(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function calculationMethod(value: string): CategoryCalculationMethod {
  return value === "total_points" ? "total_points" : "equal_assignment_percentage";
}

export function buildRulesFromCategories(
  categories: GradingCategoryRow[],
  calculationMethodOverride?: CategoryCalculationMethod,
) {
  const categoryById = new Map<string, CategoryConfig>();
  const rules: GradingRules = {
    categoryWeights: {},
    dropLowest: {},
    calculationMethods: {},
    categoryLabels: {},
    retakePolicy: "highest",
  };

  for (const row of categories) {
    const category = normalizeCategoryCode(row.code || row.name);
    const config: CategoryConfig = {
      category,
      label: row.name,
      weight: Number(row.weight),
      dropLowest: Number(row.drop_lowest),
      calculationMethod: calculationMethodOverride ?? calculationMethod(row.calculation_method),
    };
    categoryById.set(row.id, config);
    rules.categoryWeights[category] = config.weight;
    rules.calculationMethods[category] = config.calculationMethod;
    rules.categoryLabels![category] = config.label;
    if (config.dropLowest > 0) rules.dropLowest[category] = config.dropLowest;
  }

  return { categoryById, rules };
}
