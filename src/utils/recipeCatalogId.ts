import { normalizeBarcode } from "./openFoodFacts";

export const MOH_RECIPE_CATEGORY = "משרד הבריאות";

export function mohRecipeCatalogId(ministryCode: number): string {
  return `recipe:${ministryCode}`;
}

export function parseMohRecipeCatalogId(id: string): number | null {
  if (!id.startsWith("recipe:")) return null;
  const n = parseInt(id.slice("recipe:".length), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function isRecipeCatalogId(id: string): boolean {
  return id.startsWith("recipe:");
}

export function isPrefixedCatalogId(id: string): boolean {
  return id.startsWith("internal:") || isRecipeCatalogId(id);
}

export function catalogProductStorageKey(product: { id: string; gtin?: string }): string {
  if (isPrefixedCatalogId(product.id)) return product.id;
  return normalizeBarcode(product.gtin ?? product.id);
}
