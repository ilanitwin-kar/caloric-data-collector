import { fmt1 } from "./number";
import type { OpenFoodFactsProduct } from "./openFoodFacts";
import type { Verified100Row } from "./verifiedTsv";

export type OffFormFillValues = {
  name: string;
  brand: string;
  category: string;
  per100Basis: "g" | "ml";
  kcal100: string;
  prot100: string;
  carb100: string;
  fat100: string;
  totalWeightG: string;
  unitsPerPack: string;
  unitWeightG: string;
  fromVerified: boolean;
};

export function offDataToFormValues(
  off: OpenFoodFactsProduct,
  verified?: Verified100Row | null,
): OffFormFillValues {
  const useV = Boolean(verified);
  const quantityG = off.quantityG;
  const units = off.packUnits;
  const isMl =
    off.quantityText?.toLowerCase().includes("ml") ||
    off.quantityText?.toLowerCase().includes(" ליטר") ||
    false;

  let totalWeightG = "";
  let unitsPerPack = "";
  let unitWeightG = "";
  if (quantityG && quantityG > 0) {
    totalWeightG = fmt1(quantityG);
    if (units && units > 0) {
      unitsPerPack = String(units);
      unitWeightG = fmt1(quantityG / units);
    } else {
      unitsPerPack = "1";
      unitWeightG = fmt1(quantityG);
    }
  }

  const n = (v: number | undefined) =>
    v != null && Number.isFinite(v) ? String(v) : "";

  return {
    name: (useV ? verified!.name : off.productName).trim() || "",
    brand: (useV ? verified!.brand : off.brand)?.trim() ?? "",
    category: (useV ? verified!.category : off.categoriesText?.split(",")[0])?.trim() ?? "",
    per100Basis: isMl ? "ml" : "g",
    kcal100: n(useV ? verified!.calories100 : off.cals100),
    prot100: n(useV ? verified!.protein100 : off.prot100),
    carb100: n(useV ? verified!.carbs100 : off.carb100),
    fat100: n(useV ? verified!.fat100 : off.fat100),
    totalWeightG,
    unitsPerPack,
    unitWeightG,
    fromVerified: useV,
  };
}
