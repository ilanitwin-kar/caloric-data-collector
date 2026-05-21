import type { CatalogProduct } from "../context/CatalogContext";

/** True if product was added via OFF import and never saved manually. */
export function isOffImportedCatalogProduct(p: CatalogProduct): boolean {
  if (p.id.startsWith("internal:")) return false;
  const sources = p.sources ?? [];
  if (sources.some((s) => s.type === "manual")) return false;
  return sources.some((s) => s.type === "barcode_openfoodfacts");
}

export function countOffImportedCatalogProducts(catalog: CatalogProduct[]): number {
  return catalog.filter(isOffImportedCatalogProduct).length;
}
