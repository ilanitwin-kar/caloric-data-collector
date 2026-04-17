import type { Product } from "../types/product";
import { PORTION_CUP_G, PORTION_TBSP_G } from "./productExport";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** UTF-8 BOM so Excel opens Hebrew / special chars correctly when needed */
export function productsToCsv(products: Product[]): string {
  const headers = [
    "Barcode",
    "Product",
    "Brand",
    "Package weight (g)",
    "Units per pack",
    "Unit Weight (g)",
    "Calories / 100g",
    "Protein / 100g",
    "Carbs / 100g",
    "Fat / 100g",
    "Calories / unit",
    "Protein / unit",
    "Carbs / unit",
    "Fat / unit",
    "Sugars / 100g",
    "Sat fat / 100g",
    "Trans fat / 100g",
    "Fiber / 100g",
    "Sodium mg / 100g",
    "Sugar tsp / 100g",
    `Cal / tbsp (~${PORTION_TBSP_G}g)`,
    `Protein g / tbsp`,
    `Carbs g / tbsp`,
    `Fat g / tbsp`,
    `Cal / cup (~${PORTION_CUP_G}g)`,
    `Protein g / cup`,
    `Carbs g / cup`,
    `Fat g / cup`,
    "Saved (ISO)",
  ];
  const lines = [headers.join(",")];
  for (const p of products) {
    const gTb = p.tbspPer100g && p.tbspPer100g > 0 ? 100 / p.tbspPer100g : PORTION_TBSP_G;
    const gCup = p.cupsPer100g && p.cupsPer100g > 0 ? 100 / p.cupsPer100g : PORTION_CUP_G;
    const kTb = Math.round((p.cals100 * gTb) / 100);
    const kCup = Math.round((p.cals100 * gCup) / 100);
    lines.push(
      [
        escapeCsvCell(p.barcode ?? ""),
        escapeCsvCell(p.name),
        escapeCsvCell(p.brand),
        String(p.totalWeight),
        String(p.units),
        String(p.unitWeight),
        String(p.cals100),
        String(p.prot100),
        String(p.carb100),
        String(p.fat100),
        String(p.calsUnit),
        String(p.protUnit),
        String(p.carbUnit),
        String(p.fatUnit),
        String(p.sugars100 ?? ""),
        String(p.satFat100 ?? ""),
        String(p.transFat100 ?? ""),
        String(p.fiber100 ?? ""),
        String(p.sodiumMg100 ?? ""),
        String(p.sugarTeaspoons100 ?? ""),
        String(kTb),
        String(Math.round(((p.prot100 * gTb) / 100) * 1000) / 1000),
        String(Math.round(((p.carb100 * gTb) / 100) * 1000) / 1000),
        String(Math.round(((p.fat100 * gTb) / 100) * 1000) / 1000),
        String(kCup),
        String(Math.round(((p.prot100 * gCup) / 100) * 1000) / 1000),
        String(Math.round(((p.carb100 * gCup) / 100) * 1000) / 1000),
        String(Math.round(((p.fat100 * gCup) / 100) * 1000) / 1000),
        escapeCsvCell(p.savedAt),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

export function downloadCsv(filename: string, csv: string) {
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
