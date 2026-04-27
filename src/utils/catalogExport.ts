import type { CatalogProduct } from "../context/CatalogContext";

function numOrEmpty(n: number | undefined): number | string {
  if (n === undefined || !Number.isFinite(n)) return "";
  return n;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function keywordsToText(list?: string[]): string {
  if (!list?.length) return "";
  return list.join(", ");
}

function usageToText(list?: string[]): string {
  if (!list?.length) return "";
  const map: Record<string, string> = {
    ready: "מוכן",
    ingredient: "חומר גלם",
    raw: "גולמי",
    cooked: "מבושל",
    dry: "יבש",
  };
  return list.map((x) => map[x] ?? x).join(", ");
}

function measureToText(m?: string): string {
  const map: Record<string, string> = {
    unit: "יחידה",
    tbsp: "כף",
    tsp: "כפית",
    cup: "כוס",
    g100: "100g",
  };
  return m ? map[m] ?? m : "";
}

function measuresToText(list?: string[]): string {
  if (!list?.length) return "";
  return list.map(measureToText).join(", ");
}

export function catalogToSheetRows(items: CatalogProduct[]): Record<string, string | number>[] {
  return items.map((p) => {
    const per = p.nutrition?.per100g;
    return {
      מזהה: p.id,
      ברקוד: p.gtin ?? "",
      "שם מוצר": p.name ?? "",
      מותג: p.brand ?? "",
      "מילות חיפוש": keywordsToText(p.keywords),
      קטגוריה: p.category ?? "",
      שימוש: usageToText(p.usageTags as string[] | undefined),
      "ברירת מחדל": measureToText(p.defaultMeasure as string | undefined),
      "מידות נפוצות": measuresToText(p.commonMeasures as string[] | undefined),
      "משקל אריזה (ג)": numOrEmpty(p.package?.totalWeightG),
      "יחידות באריזה": numOrEmpty(p.package?.unitsPerPack),
      "משקל יחידה (ג)": numOrEmpty(p.package?.unitWeightG),
      "קלוריות ל-100 גרם": numOrEmpty(per?.calories),
      "חלבון ל-100 גרם": numOrEmpty(per?.proteinG),
      "פחמימות ל-100 גרם": numOrEmpty(per?.carbsG),
      "שומן ל-100 גרם": numOrEmpty(per?.fatG),
      "יחידות ב-100 גרם": numOrEmpty(p.measures?.unitsPer100g),
      "כפות ב-100 גרם": numOrEmpty(p.measures?.tbspPer100g),
      "כפיות ב-100 גרם": numOrEmpty(p.measures?.tspPer100g),
      "כוסות ב-100 גרם": numOrEmpty(p.measures?.cupsPer100g),
      "עודכן (ISO)": p.updatedAt,
    };
  });
}

export async function downloadCatalogXlsx(items: CatalogProduct[], filename: string): Promise<void> {
  const XLSX = await import("xlsx");
  const rows = catalogToSheetRows(items);
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "מאגר");
  // Hint Excel to open workbook right-to-left for Hebrew.
  (wb as unknown as { Workbook?: { Views?: Array<{ RTL?: boolean }> } }).Workbook = {
    Views: [{ RTL: true }],
  };
  XLSX.writeFile(wb, filename);
}

function buildCatalogTableHtml(items: CatalogProduct[]): string {
  const rows = catalogToSheetRows(items);
  if (rows.length === 0) return "<p>אין פריטים</p>";
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

export async function catalogToPdfBlob(items: CatalogProduct[], title = "מאגר מוצרים"): Promise<Blob> {
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
  div.innerHTML = `<h2 style="margin:0 0 10px;font-size:14px;">${escapeHtml(title)}</h2>${buildCatalogTableHtml(items)}`;
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

