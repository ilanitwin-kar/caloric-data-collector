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
    const basis = p.per100Basis === "ml" ? "100ml" : "100g";
    return {
      מזהה: p.id,
      ברקוד: p.gtin ?? "",
      "שם מוצר": p.name ?? "",
      "שם קצר ליומן": p.shortName ?? "",
      מותג: p.brand ?? "",
      "מילות חיפוש": keywordsToText(p.keywords),
      קטגוריה: p.category ?? "",
      שימוש: usageToText(p.usageTags as string[] | undefined),
      "בסיס ערכים": basis,
      "ברירת מחדל": measureToText(p.defaultMeasure as string | undefined),
      "מידות נפוצות": measuresToText(p.commonMeasures as string[] | undefined),
      "משקל אריזה (ג)": numOrEmpty(p.package?.totalWeightG),
      "יחידות באריזה": numOrEmpty(p.package?.unitsPerPack),
      "משקל יחידה (ג)": numOrEmpty(p.package?.unitWeightG),
      "קלוריות ל-100": numOrEmpty(per?.calories),
      "חלבון ל-100": numOrEmpty(per?.proteinG),
      "פחמימות ל-100": numOrEmpty(per?.carbsG),
      "שומן ל-100": numOrEmpty(per?.fatG),
      "יחידות ב-100": numOrEmpty(p.measures?.unitsPer100g),
      "כפות ב-100": numOrEmpty(p.measures?.tbspPer100g),
      "כפיות ב-100": numOrEmpty(p.measures?.tspPer100g),
      "כוסות ב-100": numOrEmpty(p.measures?.cupsPer100g),
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
  // XLSX.writeFile can fail silently on some mobile/PWA contexts.
  // Generate a Blob and trigger download manually for better compatibility.
  const array = XLSX.write(wb, { bookType: "xlsx", type: "array" }) as ArrayBuffer;
  const blob = new Blob([array], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function catalogToPdfRows(items: CatalogProduct[]): Record<string, string | number>[] {
  // PDF is narrow compared to the amount of catalog data.
  // Export a compact set of columns so it stays readable and doesn't get cut.
  return items.map((p) => {
    const per = p.nutrition?.per100g;
    const basis = p.per100Basis === "ml" ? "100ml" : "100g";
    return {
      "שם מוצר": p.name ?? "",
      "שם קצר": p.shortName ?? "",
      מותג: p.brand ?? "",
      קטגוריה: p.category ?? "",
      "משקל יחידה (ג)": numOrEmpty(p.package?.unitWeightG),
      בסיס: basis,
      "קלוריות ל-100": numOrEmpty(per?.calories),
      "חלבון ל-100": numOrEmpty(per?.proteinG),
      "פחמימות ל-100": numOrEmpty(per?.carbsG),
      "שומן ל-100": numOrEmpty(per?.fatG),
    };
  });
}

function buildCatalogTableHtml(rows: Record<string, string | number>[]): string {
  if (rows.length === 0) return "<p>אין פריטים</p>";
  const keys = Object.keys(rows[0]!);
  const th = keys
    .map(
      (k) =>
        `<th style="border:1px solid #333;padding:6px;text-align:right;font-size:9px;white-space:nowrap;">${escapeHtml(k)}</th>`,
    )
    .join("");
  const body = rows
    .map((r) => {
      const tds = keys
        .map((k) => {
          const v = r[k];
          const s = v === undefined || v === null ? "" : String(v);
          return `<td style="border:1px solid #333;padding:5px;text-align:right;font-size:9px;vertical-align:top;">${escapeHtml(s)}</td>`;
        })
        .join("");
      return `<tr>${tds}</tr>`;
    })
    .join("");
  return `<table style="border-collapse:collapse;width:100%;direction:rtl;table-layout:auto;">${th ? `<thead><tr>${th}</tr></thead>` : ""}<tbody>${body}</tbody></table>`;
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
  div.style.width = "1100px";
  div.style.background = "#ffffff";
  div.style.color = "#111111";
  div.style.fontSize = "10px";
  div.style.fontFamily = "Arial, Helvetica, sans-serif";
  div.style.padding = "12px";
  const rows = catalogToPdfRows(items);
  div.innerHTML = `<h2 style="margin:0 0 10px;font-size:14px;">${escapeHtml(title)}</h2>${buildCatalogTableHtml(rows)}`;
  document.body.appendChild(div);
  try {
    const canvas = await html2canvas(div, {
      scale: 2,
      useCORS: true,
      logging: false,
      backgroundColor: "#ffffff",
    });

    // Multi-page landscape A4 (prevents clipping and keeps text readable).
    const pdf = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageW = 297;
    const pageH = 210;
    const margin = 10;
    const usableW = pageW - margin * 2;
    const usableH = pageH - margin * 2;

    const pxPerMm = canvas.width / usableW;
    const sliceHPx = Math.floor(usableH * pxPerMm);

    let y = 0;
    let page = 0;
    while (y < canvas.height) {
      const h = Math.min(sliceHPx, canvas.height - y);
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = h;
      const ctx = slice.getContext("2d");
      if (!ctx) break;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, slice.width, slice.height);
      ctx.drawImage(canvas, 0, y, canvas.width, h, 0, 0, canvas.width, h);

      const imgData = slice.toDataURL("image/png");
      if (page > 0) pdf.addPage();
      const imgH = (h * usableW) / canvas.width;
      pdf.addImage(imgData, "PNG", margin, margin, usableW, imgH);

      y += h;
      page++;
      // Safety cap
      if (page > 50) break;
    }

    return pdf.output("blob");
  } finally {
    document.body.removeChild(div);
  }
}

