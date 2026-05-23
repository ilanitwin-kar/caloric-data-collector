import type { MinistryFoodKind, MinistryPortionLine } from "../utils/ministryNutrition";
import { ministryPortionHintFromLines } from "../utils/ministryNutrition";

export type VerifiedSuggestionSource = "ministry" | "tsv";

export type VerifiedSuggestionPick = {
  name: string;
  brand?: string;
  category?: string;
  calories100?: number;
  protein100?: number;
  carbs100?: number;
  fat100?: number;
  unitWeightG?: number;
  servingWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  measures?: {
    unitsPer100g?: number;
    tbspPer100g?: number;
    tspPer100g?: number;
    cupsPer100g?: number;
  };
  portionLines?: MinistryPortionLine[];
  ministryKind?: MinistryFoodKind;
  commonMeasures?: ("unit" | "tbsp" | "tsp" | "cup" | "g100")[];
  defaultMeasure?: "unit" | "tbsp" | "tsp" | "cup" | "g100";
  source?: VerifiedSuggestionSource;
  ministryCode?: number;
  verifiedId?: string;
  matchScore?: number;
};

export function verifiedPortionHintFromPick(sug: VerifiedSuggestionPick): string | null {
  const fromLines = ministryPortionHintFromLines(sug.portionLines);
  if (fromLines) return fromLines;
  const parts: string[] = [];
  if (sug.servingWeightG != null && sug.servingWeightG > 0) {
    parts.push(`מנה ~${Math.round(sug.servingWeightG)}g`);
  }
  if (sug.unitWeightG != null && sug.unitWeightG > 0) {
    parts.push(`יחידה ~${Math.round(sug.unitWeightG)}g`);
  }
  if (sug.measures?.tbspPer100g && sug.measures.tbspPer100g > 0) parts.push("כף");
  if (sug.measures?.cupsPer100g && sug.measures.cupsPer100g > 0) parts.push("כוס");
  return parts.length > 0 ? parts.join(" · ") : null;
}

export function verifiedItemToSuggestionPick(
  item: {
    id: string;
    name: string;
    brand?: string;
    category?: string;
    calories100?: number;
    protein100?: number;
    carbs100?: number;
    fat100?: number;
    unitWeightG?: number;
    servingWeightG?: number;
    packWeightG?: number;
    unitsPerPack?: number;
    measures?: VerifiedSuggestionPick["measures"];
    portionLines?: MinistryPortionLine[];
    ministryKind?: MinistryFoodKind;
    ministryCode?: number;
  },
  score: number,
  portions: Partial<VerifiedSuggestionPick>,
): VerifiedSuggestionPick {
  const source: VerifiedSuggestionSource =
    item.id.startsWith("moh:") || item.ministryCode != null ? "ministry" : "tsv";
  return {
    name: item.name,
    brand: item.brand,
    category: item.category,
    calories100: item.calories100,
    protein100: item.protein100,
    carbs100: item.carbs100,
    fat100: item.fat100,
    unitWeightG: item.unitWeightG,
    servingWeightG: item.servingWeightG,
    packWeightG: item.packWeightG,
    unitsPerPack: item.unitsPerPack,
    measures: item.measures,
    portionLines: item.portionLines,
    ministryKind: item.ministryKind,
    source,
    ministryCode: item.ministryCode,
    verifiedId: item.id,
    matchScore: score,
    ...portions,
  };
}
