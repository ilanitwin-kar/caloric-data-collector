import type { Product } from "../types/product";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

/** UTF-8 BOM so Excel opens Hebrew / special chars correctly when needed */
export function productsToCsv(products: Product[]): string {
  const headers = [
    "Product",
    "Brand",
    "Package weight (g)",
    "Units per pack",
    "Unit Weight (g)",
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
    "Saved (ISO)",
  ];
  const lines = [headers.join(",")];
  for (const p of products) {
    lines.push(
      [
        escapeCsvCell(p.name),
        escapeCsvCell(p.brand),
        String(p.totalWeight),
        String(p.units),
        String(p.unitWeight),
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
