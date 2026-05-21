import type { CatalogProduct } from "../context/CatalogContext";
import type { Verified100Item } from "../context/Verified100Context";
import type { OffPendingReview } from "./offCatalog";
import { normalizeBarcode } from "./openFoodFacts";
import {
  scoreVerifiedMatch,
  VERIFIED_AUTO_APPLY_MIN_SCORE,
  type Verified100Row,
} from "./verifiedTsv";

export type VerifiedGapRow = {
  id: string;
  name: string;
  brand?: string;
  category?: string;
  calories100?: number;
};

export type OffGapRow = {
  gtin: string;
  name: string;
  brand?: string;
  hasVerifiedMatch: boolean;
};

export function buildCatalogBarcodeSet(catalog: CatalogProduct[]): Set<string> {
  const s = new Set<string>();
  for (const p of catalog) {
    if (p.id.startsWith("internal:")) continue;
    const k = normalizeBarcode(p.id);
    if (k.length >= 8) s.add(k);
  }
  return s;
}

/** Verified row has no catalog product with strong name/brand match. */
export function catalogCoversVerified(
  verified: Verified100Row,
  catalog: CatalogProduct[],
  minScore = VERIFIED_AUTO_APPLY_MIN_SCORE,
): boolean {
  for (const p of catalog) {
    if (p.id.startsWith("internal:")) continue;
    const score = scoreVerifiedMatch(verified, { name: p.name, brand: p.brand });
    if (score >= minScore) return true;
  }
  return false;
}

export function computeVerifiedGaps(
  verifiedItems: Verified100Item[],
  catalog: CatalogProduct[],
): VerifiedGapRow[] {
  const gaps: VerifiedGapRow[] = [];
  for (const v of verifiedItems) {
    if (catalogCoversVerified(v, catalog)) continue;
    gaps.push({
      id: v.id,
      name: v.name,
      brand: v.brand,
      category: v.category,
      calories100: v.calories100,
    });
  }
  gaps.sort((a, b) => {
    const ka = `${a.brand ?? ""} ${a.name}`;
    const kb = `${b.brand ?? ""} ${b.name}`;
    return ka.localeCompare(kb, "he");
  });
  return gaps;
}

/** OFF pending rows whose barcode is not in the personal catalog. */
export function computeOffPendingGaps(
  pending: OffPendingReview[],
  catalog: CatalogProduct[],
): OffGapRow[] {
  const inCatalog = buildCatalogBarcodeSet(catalog);
  const gaps: OffGapRow[] = [];
  for (const p of pending) {
    const gtin = normalizeBarcode(p.gtin ?? p.id);
    if (gtin.length < 8 || inCatalog.has(gtin)) continue;
    gaps.push({
      gtin,
      name: p.offReviewMeta?.offName?.trim() || p.name,
      brand: p.offReviewMeta?.offBrand?.trim() || p.brand,
      hasVerifiedMatch: (p.offReviewMeta?.verifiedLink?.matchScore ?? 0) >= VERIFIED_AUTO_APPLY_MIN_SCORE,
    });
  }
  gaps.sort((a, b) => {
    const ka = `${a.brand ?? ""} ${a.name}`;
    const kb = `${b.brand ?? ""} ${b.name}`;
    return ka.localeCompare(kb, "he");
  });
  return gaps;
}

export function countOffPendingAlreadyInCatalog(
  pending: OffPendingReview[],
  catalog: CatalogProduct[],
): number {
  const inCatalog = buildCatalogBarcodeSet(catalog);
  let n = 0;
  for (const p of pending) {
    const gtin = normalizeBarcode(p.gtin ?? p.id);
    if (gtin.length >= 8 && inCatalog.has(gtin)) n += 1;
  }
  return n;
}

export function matchesGapSearch(
  haystack: string[],
  query: string,
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.join(" ").toLowerCase().includes(q);
}
