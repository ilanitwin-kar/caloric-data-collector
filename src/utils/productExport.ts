import type { Product } from "../types/product";

export const PORTION_TBSP_G = 15;
export const PORTION_CUP_G = 240;

function numOrEmpty(n: number | undefined): number | string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return n;
}

function perUnitFrom100(p: Product, v100: number | undefined): number | string {
  if (v100 === undefined || !Number.isFinite(v100)) return "";
  const f = p.unitWeight / 100;
  return Math.round(v100 * f * 1000) / 1000;
}

function perGramsFrom100(v100: number | undefined, grams: number): number | string {
  if (v100 === undefined || !Number.isFinite(v100)) return "";
  return Math.round((v100 * grams * 1000) / 100) / 1000;
}

function perGramsCals100(cals100: number | undefined, grams: number): number | string {
  if (cals100 === undefined || !Number.isFinite(cals100)) return "";
  return Math.round((cals100 * grams) / 100);
}

function gramsFromPer100(countPer100: number | undefined): number | undefined {
  if (countPer100 === undefined || !Number.isFinite(countPer100) || countPer100 <= 0) return undefined;
  return 100 / countPer100;
}

function gramsForTbsp(p: Product): number {
  return gramsFromPer100(p.tbspPer100g) ?? PORTION_TBSP_G;
}

function gramsForCup(p: Product): number {
  return gramsFromPer100(p.cupsPer100g) ?? PORTION_CUP_G;
}

export function productsToSheetRows(products: Product[]): Record<string, string | number>[] {
  return products.map((p) => ({
    ברקוד: p.barcode ?? "",
    "שם מוצר": p.name,
    מותג: p.brand,
    "משקל אריזה (ג)": p.totalWeight,
    "יחידות באריזה": p.units,
    "משקל יחידה (ג)": Math.round(p.unitWeight * 1000) / 1000,
    "קלוריות ל-100 גרם": p.cals100,
    "חלבון ל-100 גרם": p.prot100,
    "פחמימות ל-100 גרם": p.carb100,
    "שומן ל-100 גרם": p.fat100,
    "סוכרים ל-100 גרם": numOrEmpty(p.sugars100),
    "שומן רווי ל-100 גרם": numOrEmpty(p.satFat100),
    "שומן טראנס ל-100 גרם": numOrEmpty(p.transFat100),
    "סיבים ל-100 גרם": numOrEmpty(p.fiber100),
    "נתרן מג ל-100 גרם": numOrEmpty(p.sodiumMg100),
    "כפיות סוכר ל-100 גרם": numOrEmpty(p.sugarTeaspoons100),
    "קלוריות ליחידה": Math.round(p.calsUnit * 1000) / 1000,
    "חלבון ליחידה": perUnitFrom100(p, p.prot100),
    "פחמימות ליחידה": perUnitFrom100(p, p.carb100),
    "שומן ליחידה": perUnitFrom100(p, p.fat100),
    "סוכרים ליחידה": perUnitFrom100(p, p.sugars100),
    "שומן רווי ליחידה": perUnitFrom100(p, p.satFat100),
    "שומן טראנס ליחידה": perUnitFrom100(p, p.transFat100),
    "סיבים ליחידה": perUnitFrom100(p, p.fiber100),
    "נתרן מג ליחידה": perUnitFrom100(p, p.sodiumMg100),
    "כפיות סוכר ליחידה": perUnitFrom100(p, p.sugarTeaspoons100),
    [`קק"ל כף (${Math.round(gramsForTbsp(p) * 10) / 10}ג)`]: perGramsCals100(p.cals100, gramsForTbsp(p)),
    [`חלבון ג כף`]: perGramsFrom100(p.prot100, gramsForTbsp(p)),
    [`פחמימות ג כף`]: perGramsFrom100(p.carb100, gramsForTbsp(p)),
    [`שומן ג כף`]: perGramsFrom100(p.fat100, gramsForTbsp(p)),
    [`קק"ל כוס (${Math.round(gramsForCup(p) * 10) / 10}ג)`]: perGramsCals100(p.cals100, gramsForCup(p)),
    [`חלבון ג כוס`]: perGramsFrom100(p.prot100, gramsForCup(p)),
    [`פחמימות ג כוס`]: perGramsFrom100(p.carb100, gramsForCup(p)),
    [`שומן ג כוס`]: perGramsFrom100(p.fat100, gramsForCup(p)),
    "נשמר (ISO)": p.savedAt,
  }));
}

export async function downloadProductsXlsx(products: Product[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = productsToSheetRows(products);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "מוצרים");
  XLSX.writeFile(wb, filename);
}

export async function productsToXlsxBlob(products: Product[]): Promise<Blob> {
  const XLSX = await import("xlsx");
  const rows = productsToSheetRows(products);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "מוצרים");
  const buf = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  return new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildProductsTableHtml(products: Product[]): string {
  const rows = productsToSheetRows(products);
  if (rows.length === 0) return "<p>אין מוצרים</p>";
  const keys = Object.keys(rows[0]!);
  const th = keys
    .map(
      (k) =>
        `<th style="border:1px solid #333;padding:6px;text-align:right;font-size:10px;">${escapeHtml(k)}</th>`,
    )
    .join("");
  const body = rows
    .map((r) => {
      const tds = keys
        .map((k) => {
          const v = r[k];
          const s = v === undefined || v === null ? "" : String(v);
          return `<td style="border:1px solid #333;padding:5px;text-align:right;font-size:10px;">${escapeHtml(s)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;direction:rtl;">${th ? `<thead><tr>${th}</tr></thead>` : ""}<tbody>${body}</tbody></table>`;
}

export async function productsToPdfBlob(products: Product[]): Promise<Blob> {
  const [{ jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ]);
  const div = document.createElement("div");
  div.dir = "rtl";
  div.style.position = "fixed";
  div.style.left = "0";
  div.style.top = "0";
  div.style.width = "780px";
  div.style.background = "#ffffff";
  div.style.color = "#111111";
  div.style.fontSize = "11px";
  div.style.fontFamily = "Arial, Helvetica, sans-serif";
  div.style.padding = "12px";
  div.innerHTML = `<h2 style="margin:0 0 10px;font-size:14px;">המוצרים שלי</h2>${buildProductsTableHtml(products)}`;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: 1.35,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });
    const imgWmm = 190;
    const imgHmm = (canvas.height * imgWmm) / canvas.width;
    const pdfH = Math.max(297, imgHmm + 24);
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: [210, pdfH] });
    pdf.addImage(canvas.toDataURL("image/png"), "PNG", 10, 10, imgWmm, imgHmm);
    return pdf.output("blob");
  } finally {
    document.body.removeChild(div);
  }
}

function r1(n: number): string {
  return String(Math.round(n * 10) / 10);
}

export function productsToShareSummaryText(products: Product[], maxChars = 10_000): string {
  const lines: string[] = [
    `המוצרים שלי — ${products.length} פריטים`,
    "100ג · יחידה · כף · כוס",
    "",
  ];
  for (const p of products) {
    const bc = p.barcode ?? "ללא ברקוד";
    const gTb = gramsForTbsp(p);
    const gCup = gramsForCup(p);
    const kTb = perGramsCals100(p.cals100, gTb);
    const kCup = perGramsCals100(p.cals100, gCup);
    const kTbS = kTb === "" ? "—" : String(kTb);
    const kCupS = kCup === "" ? "—" : String(kCup);
    lines.push(`• ${p.name} | ${p.brand} | ${bc}`);
    lines.push(
      `  100ג: ${p.cals100} קק"ל, ח ${r1(p.prot100)}ג, פ ${r1(p.carb100)}ג, ש ${r1(p.fat100)}ג`,
    );
    lines.push(
      `  יחידה (${r1(p.unitWeight)}ג): ${r1(p.calsUnit)} קק"ל, ח ${r1(p.protUnit)}ג, פ ${r1(p.carbUnit)}ג, ש ${r1(p.fatUnit)}ג`,
    );
    lines.push(
      `  כף: ${kTbS} קק"ל, ח ${r1((p.prot100 * gTb) / 100)}ג, פ ${r1((p.carb100 * gTb) / 100)}ג, ש ${r1((p.fat100 * gTb) / 100)}ג`,
    );
    lines.push(
      `  כוס: ${kCupS} קק"ל, ח ${r1((p.prot100 * gCup) / 100)}ג, פ ${r1((p.carb100 * gCup) / 100)}ג, ש ${r1((p.fat100 * gCup) / 100)}ג`,
    );
    lines.push(`  אריזה: ${p.totalWeight}ג, ${p.units} יח׳`);
    lines.push("");
  }
  lines.push("נתונים מלאים: Excel / PDF / CSV מהאפליקציה.");
  let text = lines.join("\n");
  if (text.length > maxChars) {
    text = `${text.slice(0, Math.max(0, maxChars - 120))}\n\n…[נחתך — לטקסט מלא: אימייל עם פחות מוצרים או ייצוא קובץ]`;
  }
  return text;
}

export function whatsAppShareUrl(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

export function mailtoProductsUrl(subject: string, body: string): string {
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
