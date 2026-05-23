import type { CatalogNutritionPer100g, CatalogProduct } from "../context/CatalogContext";
import {
  normalizeBarcode,
  offProductHasNutrition,
  parseOffProductRecord,
  type OpenFoodFactsProduct,
} from "./openFoodFacts";
import { offProductIsPerMl } from "./offFormFill";
import {
  scoreVerifiedMatch,
  stableId,
  VERIFIED_AUTO_APPLY_MIN_SCORE,
  type Verified100Row,
} from "./verifiedTsv";
import { enrichProductFromVerified } from "./verifiedMeasures";

export function catalogEntryBlocksOffImport(existing: CatalogProduct | undefined): boolean {
  if (!existing) return false;
  if (existing.id.startsWith("internal:")) return true;
  if (existing.sources?.some((s) => s.type === "manual")) return true;
  return true;
}

export function findBestVerifiedForOff(
  verifiedItems: Verified100Row[],
  q: { name: string; brand?: string },
): { item: Verified100Row; score: number } | null {
  let best: { item: Verified100Row; score: number } | null = null;
  for (const it of verifiedItems) {
    if ("id" in it && typeof it.id === "string" && it.id.startsWith("moh:")) continue;
    const score = scoreVerifiedMatch(it, q);
    if (score < VERIFIED_AUTO_APPLY_MIN_SCORE) continue;
    if (!best || score > best.score) best = { item: it, score };
  }
  return best;
}

export type OffCatalogBuildInput = {
  gtin: string;
  off: OpenFoodFactsProduct;
  verifiedItems?: Verified100Row[];
  now?: string;
};

export type OffVerifiedLinkMeta = {
  verifiedId: string;
  verifiedName: string;
  verifiedBrand?: string;
  verifiedCategory?: string;
  matchScore: number;
  offName: string;
  offBrand?: string;
  nutritionFromVerified: boolean;
  offPer100?: CatalogNutritionPer100g;
  verifiedPer100?: CatalogNutritionPer100g;
};

/** Product staged for review before entering the main catalog. */
export type OffPendingReview = CatalogProduct & {
  offReviewMeta: {
    offName: string;
    offBrand?: string;
    verifiedLink?: OffVerifiedLinkMeta;
  };
};

export type OffCatalogBuildResult = {
  product: CatalogProduct;
  usedVerified: boolean;
  off: OpenFoodFactsProduct;
  verifiedHit: { item: Verified100Row; score: number } | null;
};

export function toOffPendingReview(built: OffCatalogBuildResult): OffPendingReview {
  const offName = built.off.productName.trim() || "ללא שם";
  const offBrand = built.off.brand.trim() || undefined;
  let verifiedLink: OffVerifiedLinkMeta | undefined;
  const offPer100: CatalogNutritionPer100g = {
    calories: built.off.cals100,
    proteinG: built.off.prot100,
    carbsG: built.off.carb100,
    fatG: built.off.fat100,
  };
  if (built.verifiedHit) {
    const v = built.verifiedHit.item;
    verifiedLink = {
      verifiedId: stableId(v.brand, v.name),
      verifiedName: v.name,
      verifiedBrand: v.brand,
      verifiedCategory: v.category,
      matchScore: built.verifiedHit.score,
      offName,
      offBrand,
      nutritionFromVerified: built.usedVerified,
      offPer100,
      verifiedPer100: {
        calories: v.calories100,
        proteinG: v.protein100,
        carbsG: v.carbs100,
        fatG: v.fat100,
      },
    };
  }
  return {
    ...built.product,
    offReviewMeta: { offName, offBrand, verifiedLink },
  };
}

export function buildCatalogProductFromOff(input: OffCatalogBuildInput): OffCatalogBuildResult | null {
  const gtin = normalizeBarcode(input.gtin);
  if (gtin.length < 8) return null;

  const off = input.off;
  const name = off.productName.trim() || "ללא שם";
  const brand = off.brand.trim() || undefined;

  const verifiedHit = input.verifiedItems?.length
    ? findBestVerifiedForOff(input.verifiedItems, { name, brand })
    : null;

  const per100: CatalogNutritionPer100g = verifiedHit
    ? {
        calories: verifiedHit.item.calories100,
        proteinG: verifiedHit.item.protein100,
        carbsG: verifiedHit.item.carbs100,
        fatG: verifiedHit.item.fat100,
      }
    : {
        calories: off.cals100,
        proteinG: off.prot100,
        carbsG: off.carb100,
        fatG: off.fat100,
      };

  const hasNutrition =
    per100.calories != null ||
    per100.proteinG != null ||
    per100.carbsG != null ||
    per100.fatG != null;
  if (!hasNutrition) return null;

  const quantityG = off.quantityG;
  const units = off.packUnits;
  const unitWeightG =
    quantityG && units && units > 0 ? quantityG / units : quantityG && !units ? quantityG : undefined;

  const now = input.now ?? new Date().toISOString();
  const sources: CatalogProduct["sources"] = [{ type: "barcode_openfoodfacts", at: now }];
  if (verifiedHit) sources.push({ type: "verified100", at: now });

  const category =
    verifiedHit?.item.category?.trim() ||
    (off.categoriesText?.split(",")[0]?.trim() ?? undefined);

  let product: CatalogProduct = {
    id: gtin,
    gtin,
    name: verifiedHit?.item.name.trim() || name,
    brand: verifiedHit?.item.brand?.trim() || brand,
    category,
    usageTags: ["ready"],
    per100Basis: offProductIsPerMl(off) ? "ml" : "g",
    defaultMeasure: "unit",
    commonMeasures: ["unit", "g100"],
    createdAt: now,
    updatedAt: now,
    sources,
    package:
      quantityG && quantityG > 0
        ? {
            totalWeightG: quantityG,
            unitsPerPack: units && units > 0 ? units : 1,
            unitWeightG,
          }
        : undefined,
    nutrition: {
      per100g: per100,
      perUnit:
        unitWeightG && unitWeightG > 0
          ? {
              calories:
                typeof per100.calories === "number"
                  ? (per100.calories * unitWeightG) / 100
                  : undefined,
              proteinG:
                typeof per100.proteinG === "number"
                  ? (per100.proteinG * unitWeightG) / 100
                  : undefined,
              carbsG:
                typeof per100.carbsG === "number"
                  ? (per100.carbsG * unitWeightG) / 100
                  : undefined,
              fatG:
                typeof per100.fatG === "number" ? (per100.fatG * unitWeightG) / 100 : undefined,
            }
          : undefined,
    },
  };

  if (verifiedHit) {
    product = enrichProductFromVerified(product, verifiedHit.item);
  }

  return {
    product,
    usedVerified: Boolean(verifiedHit),
    off,
    verifiedHit,
  };
}

export function buildCatalogProductFromOffRecord(
  record: Record<string, unknown>,
  verifiedItems?: Verified100Row[],
): OffCatalogBuildResult | null {
  const code = String(record.code ?? "").replace(/\D/g, "");
  if (code.length < 8) return null;
  const off = parseOffProductRecord(record);
  if (!offProductHasNutrition(off)) return null;
  return buildCatalogProductFromOff({ gtin: code, off, verifiedItems });
}
