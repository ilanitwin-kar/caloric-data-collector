import type {
  CatalogMeasureKey,
  CatalogMeasures,
  CatalogNutritionPer100g,
  CatalogNutritionPerUnit,
  CatalogPackage,
  CatalogProduct,
} from "../context/CatalogContext";
import type { Verified100Row } from "./verifiedTsv";

function computePerUnit(
  per100: CatalogNutritionPer100g,
  unitWeightG?: number,
): CatalogNutritionPerUnit {
  if (!unitWeightG || !Number.isFinite(unitWeightG) || unitWeightG <= 0) return {};
  const factor = unitWeightG / 100;
  const mul = (x?: number) =>
    typeof x === "number" && Number.isFinite(x) ? x * factor : undefined;
  return {
    calories: mul(per100.calories),
    proteinG: mul(per100.proteinG),
    carbsG: mul(per100.carbsG),
    fatG: mul(per100.fatG),
  };
}

function unitWeightFromVerified(v: Verified100Row): number | undefined {
  if (v.unitWeightG != null && v.unitWeightG > 0) return v.unitWeightG;
  const u = v.measures?.unitsPer100g;
  if (u != null && u > 0) return 100 / u;
  return undefined;
}

export function commonMeasuresFromVerified(v: Verified100Row): CatalogMeasureKey[] {
  const out: CatalogMeasureKey[] = [];
  if (unitWeightFromVerified(v)) out.push("unit");
  if (v.measures?.tbspPer100g && v.measures.tbspPer100g > 0) out.push("tbsp");
  if (v.measures?.tspPer100g && v.measures.tspPer100g > 0) out.push("tsp");
  if (v.measures?.cupsPer100g && v.measures.cupsPer100g > 0) out.push("cup");
  out.push("g100");
  return [...new Set(out)].slice(0, 4) as CatalogMeasureKey[];
}

export function verifiedHasPortions(v: Verified100Row): boolean {
  return (
    unitWeightFromVerified(v) != null ||
    (v.packWeightG != null && v.packWeightG > 0) ||
    Boolean(
      v.measures &&
        ((v.measures.tbspPer100g ?? 0) > 0 ||
          (v.measures.tspPer100g ?? 0) > 0 ||
          (v.measures.cupsPer100g ?? 0) > 0),
    )
  );
}

export function buildPackageFromVerified(
  v: Verified100Row,
  fallback?: CatalogPackage,
): CatalogPackage | undefined {
  const unitG = unitWeightFromVerified(v);
  const packG = v.packWeightG;
  if (!unitG && !packG && !fallback) return fallback;

  const totalWeightG = packG ?? fallback?.totalWeightG ?? unitG;
  const unitWeightG = unitG ?? fallback?.unitWeightG;
  let unitsPerPack = v.unitsPerPack ?? fallback?.unitsPerPack;
  if (unitsPerPack == null && totalWeightG && unitWeightG && unitWeightG > 0) {
    unitsPerPack = Math.max(1, Math.round(totalWeightG / unitWeightG));
  }
  if (unitsPerPack == null) unitsPerPack = 1;

  if (!totalWeightG && !unitWeightG) return fallback;
  return {
    totalWeightG: totalWeightG ?? unitWeightG,
    unitWeightG,
    unitsPerPack,
  };
}

export function enrichProductFromVerified(
  product: CatalogProduct,
  verified: Verified100Row,
): CatalogProduct {
  if (!verifiedHasPortions(verified)) return product;

  const per100 = product.nutrition?.per100g ?? {};
  const pkg = buildPackageFromVerified(verified, product.package);
  const measures: CatalogMeasures | undefined = verified.measures
    ? { ...verified.measures }
    : product.measures;
  const unitG = pkg?.unitWeightG;
  const commonMeasures = commonMeasuresFromVerified(verified);
  const defaultMeasure: CatalogMeasureKey =
    commonMeasures.includes("unit") ? "unit"
    : commonMeasures.includes("tbsp") ? "tbsp"
    : commonMeasures.includes("cup") ? "cup"
    : (product.defaultMeasure ?? "g100");

  return {
    ...product,
    defaultMeasure,
    commonMeasures,
    package: pkg ?? product.package,
    measures: measures && Object.keys(measures).length > 0 ? measures : product.measures,
    nutrition: {
      ...product.nutrition,
      per100g: per100,
      perUnit:
        unitG && unitG > 0
          ? computePerUnit(per100, unitG)
          : product.nutrition?.perUnit,
    },
  };
}

/** Form fields when user picks a verified / ministry suggestion. */
export type VerifiedPickPortions = {
  unitWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  measures?: CatalogMeasures;
  commonMeasures?: CatalogMeasureKey[];
  defaultMeasure?: CatalogMeasureKey;
};

export function verifiedRowToPickPortions(v: Verified100Row): VerifiedPickPortions {
  if (!verifiedHasPortions(v)) return {};
  const pkg = buildPackageFromVerified(v);
  const commonMeasures = commonMeasuresFromVerified(v);
  return {
    unitWeightG: pkg?.unitWeightG,
    packWeightG: pkg?.totalWeightG,
    unitsPerPack: pkg?.unitsPerPack,
    measures: v.measures ? { ...v.measures } : undefined,
    commonMeasures,
    defaultMeasure: commonMeasures.includes("unit")
      ? "unit"
      : commonMeasures.includes("tbsp")
        ? "tbsp"
        : commonMeasures.includes("cup")
          ? "cup"
          : "g100",
  };
}
