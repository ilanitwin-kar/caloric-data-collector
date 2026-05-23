import type { CatalogProduct } from "../context/CatalogContext";
import {
  catalogProductPortionHint,
  catalogProductPortionLevel,
  catalogProductHasPortions,
  type CatalogPortionLevel,
} from "./verifiedMeasures";

export type CatalogCompletenessFilter =
  | "all"
  | "complete"
  | "missingNutrition"
  | "missingPortions"
  | "packageOnly";

export type CatalogFieldKey =
  | "calories"
  | "protein"
  | "carbs"
  | "fat"
  | "totalWeightG"
  | "unitWeightG"
  | "unitsPerPack"
  | "portions"
  | "brand"
  | "category"
  | "shortName"
  | "keywords"
  | "usageTags";

export const CATALOG_FIELD_LABELS: Record<CatalogFieldKey, string> = {
  calories: "קלוריות ל־100",
  protein: "חלבון",
  carbs: "פחמימה",
  fat: "שומן",
  totalWeightG: "משקל/נפח אריזה",
  unitWeightG: "משקל יחידה",
  unitsPerPack: "יחידות באריזה",
  portions: "מידות (יחידה/כף/כוס)",
  brand: "מותג",
  category: "קטגוריה",
  shortName: "שם קצר",
  keywords: "מילות חיפוש",
  usageTags: "תגי שימוש",
};

const RECOMMENDED_KEYS: CatalogFieldKey[] = [
  "calories",
  "protein",
  "carbs",
  "fat",
  "totalWeightG",
  "unitWeightG",
  "portions",
];

const OPTIONAL_KEYS: CatalogFieldKey[] = [
  "unitsPerPack",
  "brand",
  "category",
  "shortName",
  "keywords",
  "usageTags",
];

function hasNum(v?: number): boolean {
  return v != null && Number.isFinite(v) && v >= 0;
}

function fieldFilled(p: CatalogProduct, key: CatalogFieldKey): boolean {
  const per = p.nutrition?.per100g;
  const pkg = p.package;
  switch (key) {
    case "calories":
      return hasNum(per?.calories);
    case "protein":
      return hasNum(per?.proteinG);
    case "carbs":
      return hasNum(per?.carbsG);
    case "fat":
      return hasNum(per?.fatG);
    case "totalWeightG":
      return hasNum(pkg?.totalWeightG) && (pkg!.totalWeightG ?? 0) > 0;
    case "unitWeightG":
      return hasNum(pkg?.unitWeightG) && (pkg!.unitWeightG ?? 0) > 0;
    case "unitsPerPack":
      return hasNum(pkg?.unitsPerPack) && (pkg!.unitsPerPack ?? 0) > 0;
    case "portions":
      return catalogProductHasPortions(p);
    case "brand":
      return Boolean(p.brand?.trim());
    case "category":
      return Boolean(p.category?.trim());
    case "shortName":
      return Boolean(p.shortName?.trim());
    case "keywords":
      return Boolean(p.keywords?.length);
    case "usageTags":
      return Boolean(p.usageTags?.length);
    default:
      return false;
  }
}

export type CatalogCompletenessReport = {
  portionLevel: CatalogPortionLevel;
  portionHint: string | null;
  filled: CatalogFieldKey[];
  missingRecommended: CatalogFieldKey[];
  missingOptional: CatalogFieldKey[];
  recommendedScore: { filled: number; total: number };
  /** All recommended fields + full portion measures. */
  isComplete: boolean;
  hasCalories: boolean;
  hasPackage: boolean;
};

export function analyzeCatalogCompleteness(p: CatalogProduct): CatalogCompletenessReport {
  const filled: CatalogFieldKey[] = [];
  const missingRecommended: CatalogFieldKey[] = [];
  const missingOptional: CatalogFieldKey[] = [];

  for (const key of RECOMMENDED_KEYS) {
    if (fieldFilled(p, key)) filled.push(key);
    else missingRecommended.push(key);
  }
  for (const key of OPTIONAL_KEYS) {
    if (fieldFilled(p, key)) filled.push(key);
    else missingOptional.push(key);
  }

  const portionLevel = catalogProductPortionLevel(p);
  const portionHint = catalogProductPortionHint(p);
  const recommendedFilled = RECOMMENDED_KEYS.filter((k) => fieldFilled(p, k)).length;

  const hasPackage =
    fieldFilled(p, "totalWeightG") || fieldFilled(p, "unitWeightG");

  return {
    portionLevel,
    portionHint,
    filled,
    missingRecommended,
    missingOptional,
    recommendedScore: { filled: recommendedFilled, total: RECOMMENDED_KEYS.length },
    isComplete: missingRecommended.length === 0,
    hasCalories: fieldFilled(p, "calories"),
    hasPackage,
  };
}

export function matchesCompletenessFilter(
  p: CatalogProduct,
  filter: CatalogCompletenessFilter,
): boolean {
  if (filter === "all") return true;
  const r = analyzeCatalogCompleteness(p);
  switch (filter) {
    case "complete":
      return r.isComplete;
    case "missingNutrition":
      return !r.hasCalories;
    case "missingPortions":
      return r.portionLevel !== "full";
    case "packageOnly":
      return r.portionLevel === "packageOnly";
    default:
      return true;
  }
}

export type CatalogCompletenessTotals = {
  complete: number;
  withCalories: number;
  withFullPortions: number;
  packageOnly: number;
  noPortions: number;
  missingNutrition: number;
};

export function countCatalogCompleteness(products: CatalogProduct[]): CatalogCompletenessTotals {
  let complete = 0;
  let withCalories = 0;
  let withFullPortions = 0;
  let packageOnly = 0;
  let noPortions = 0;
  let missingNutrition = 0;

  for (const p of products) {
    const r = analyzeCatalogCompleteness(p);
    if (r.isComplete) complete += 1;
    if (r.hasCalories) withCalories += 1;
    else missingNutrition += 1;
    if (r.portionLevel === "full") withFullPortions += 1;
    else if (r.portionLevel === "packageOnly") packageOnly += 1;
    else noPortions += 1;
  }

  return {
    complete,
    withCalories,
    withFullPortions,
    packageOnly,
    noPortions,
    missingNutrition,
  };
}
