import type { VerifiedSuggestionPick } from "../components/verifiedSuggestionTypes";
import { fmt1, parseNum } from "./number";
import { buildVerifiedSearchQuery } from "./verifiedSearch";
import { verifiedRowToPickPortions } from "./verifiedMeasures";

export type CatalogEditFocus = "nutrition" | "packaging" | "measures" | "general";

export function parseCatalogEditFocus(raw: string | null | undefined): CatalogEditFocus | null {
  if (raw === "nutrition" || raw === "packaging" || raw === "measures" || raw === "general") {
    return raw;
  }
  return null;
}

type DraftIdentity = {
  name: string;
  shortName: string;
  brand: string;
  keywords: string;
  category: string;
};

type DraftNutrition = DraftIdentity & {
  per100Basis: "g" | "ml";
  calories100: string;
  protein100: string;
  carbs100: string;
  fat100: string;
};

type DraftPortions = {
  totalWeightG: string;
  unitsPerPack: string;
  unitWeightG: string;
  unitsPer100g: string;
  tbspPer100g: string;
  tspPer100g: string;
  cupsPer100g: string;
  defaultMeasure: string;
  commonMeasures: string[];
};

export function buildCatalogEditSearchQuery(d: DraftIdentity): string {
  return buildVerifiedSearchQuery({
    name: d.name,
    shortName: d.shortName,
    keywordsRaw: d.keywords,
    category: d.category,
  });
}

export function catalogEditPickSig(d: DraftIdentity): string {
  return `${d.name.trim()}|${d.brand.trim()}|${d.shortName.trim()}|${d.keywords.trim()}|${d.category.trim()}`;
}

export function draftHasNutrition(d: Pick<DraftNutrition, "calories100">): boolean {
  const kcal = parseNum(d.calories100);
  return kcal != null && kcal > 0;
}

export function applyVerifiedNutritionToDraft<T extends DraftNutrition>(d: T, sug: VerifiedSuggestionPick): T {
  return {
    ...d,
    per100Basis: "g",
    calories100: sug.calories100 != null ? String(sug.calories100) : d.calories100,
    protein100: sug.protein100 != null ? String(sug.protein100) : d.protein100,
    carbs100: sug.carbs100 != null ? String(sug.carbs100) : d.carbs100,
    fat100: sug.fat100 != null ? String(sug.fat100) : d.fat100,
  };
}

export function applyVerifiedFullToDraft<T extends DraftNutrition>(d: T, sug: VerifiedSuggestionPick): T {
  const withNutrition = applyVerifiedNutritionToDraft(d, sug);
  return {
    ...withNutrition,
    name: sug.name || withNutrition.name,
    shortName: withNutrition.shortName.trim() ? withNutrition.shortName : (sug.name ?? ""),
    brand: sug.brand ?? withNutrition.brand,
    category: sug.category ?? withNutrition.category,
  };
}

export function applyMohPortionsToDraft<T extends DraftPortions>(
  d: T,
  sug: VerifiedSuggestionPick,
): T {
  const portions = verifiedRowToPickPortions(sug);
  const commonMeasures = portions.commonMeasures?.length
    ? (portions.commonMeasures.slice(0, 4) as T["commonMeasures"])
    : d.commonMeasures;
  return {
    ...d,
    totalWeightG:
      portions.packWeightG != null ? fmt1(portions.packWeightG) : d.totalWeightG,
    unitsPerPack:
      portions.unitsPerPack != null ? String(portions.unitsPerPack) : d.unitsPerPack,
    unitWeightG:
      portions.unitWeightG != null ? fmt1(portions.unitWeightG) : d.unitWeightG,
    unitsPer100g:
      portions.measures?.unitsPer100g != null
        ? String(portions.measures.unitsPer100g)
        : d.unitsPer100g,
    tbspPer100g:
      portions.measures?.tbspPer100g != null
        ? String(portions.measures.tbspPer100g)
        : d.tbspPer100g,
    tspPer100g:
      portions.measures?.tspPer100g != null
        ? String(portions.measures.tspPer100g)
        : d.tspPer100g,
    cupsPer100g:
      portions.measures?.cupsPer100g != null
        ? String(portions.measures.cupsPer100g)
        : d.cupsPer100g,
    commonMeasures,
    defaultMeasure: portions.defaultMeasure ?? d.defaultMeasure,
  };
}
