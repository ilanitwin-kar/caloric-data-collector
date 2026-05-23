import type { CatalogNutritionPer100g } from "../context/CatalogContext";

export function formatPer100gLine(per?: CatalogNutritionPer100g): string {
  if (!per) return "—";
  const parts: string[] = [];
  if (per.calories != null) parts.push(`${per.calories} קק״ל`);
  if (per.proteinG != null) parts.push(`חלבון ${per.proteinG}g`);
  if (per.carbsG != null) parts.push(`פחמ׳ ${per.carbsG}g`);
  if (per.fatG != null) parts.push(`שומן ${per.fatG}g`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}
