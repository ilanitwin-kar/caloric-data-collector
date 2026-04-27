import type { CatalogProduct } from "../context/CatalogContext";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v.replace(",", ".").trim());
  return Number.isFinite(n) ? n : undefined;
}

function keywordsToCell(list?: string[]): string {
  if (!list?.length) return "";
  return list.join("|");
}

function keywordsFromCell(raw?: string): string[] | undefined {
  const s = (raw ?? "").trim();
  if (!s) return undefined;
  const list = s
    .split(/[|,]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

export function catalogToCsv(items: CatalogProduct[]): string {
  const headers = [
    "id",
    "gtin",
    "name",
    "brand",
    "keywords",
    "category",
    "usageTags",
    "totalWeightG",
    "unitsPerPack",
    "calories100",
    "protein100",
    "carbs100",
    "fat100",
    "unitsPer100g",
    "tbspPer100g",
    "tspPer100g",
    "cupsPer100g",
  ];
  const lines = [headers.join(",")];
  for (const p of items) {
    const per = p.nutrition?.per100g;
    lines.push(
      [
        escapeCsvCell(p.id),
        escapeCsvCell(p.gtin ?? ""),
        escapeCsvCell(p.name ?? ""),
        escapeCsvCell(p.brand ?? ""),
        escapeCsvCell(keywordsToCell(p.keywords)),
        escapeCsvCell(p.category ?? ""),
        escapeCsvCell((p.usageTags ?? []).join("|")),
        String(p.package?.totalWeightG ?? ""),
        String(p.package?.unitsPerPack ?? ""),
        String(per?.calories ?? ""),
        String(per?.proteinG ?? ""),
        String(per?.carbsG ?? ""),
        String(per?.fatG ?? ""),
        String(p.measures?.unitsPer100g ?? ""),
        String(p.measures?.tbspPer100g ?? ""),
        String(p.measures?.tspPer100g ?? ""),
        String(p.measures?.cupsPer100g ?? ""),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
}

export type CatalogCsvRow = {
  id: string;
  gtin?: string;
  name: string;
  brand?: string;
  keywords?: string[];
  category?: string;
  usageTags?: string[];
  totalWeightG?: number;
  unitsPerPack?: number;
  calories100?: number;
  protein100?: number;
  carbs100?: number;
  fat100?: number;
  unitsPer100g?: number;
  tbspPer100g?: number;
  tspPer100g?: number;
  cupsPer100g?: number;
};

export function parseCatalogCsv(csv: string): CatalogCsvRow[] {
  const raw = csv.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const header = splitCsvLine(lines[0]).map(normalizeHeader);
  const idx = (name: string) => header.indexOf(normalizeHeader(name));
  const get = (cells: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? cells[i] : undefined;
  };

  const rows: CatalogCsvRow[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const name = (get(cells, "name") ?? "").trim();
    if (!name) continue;

    const rawId = (get(cells, "id") ?? "").trim();
    const rawGtin = (get(cells, "gtin") ?? "").replace(/\D/g, "");
    const id =
      rawId ||
      (rawGtin && rawGtin.length >= 8 ? rawGtin : "");
    if (!id) continue;

    const brand = (get(cells, "brand") ?? "").trim() || undefined;
    const keywords = keywordsFromCell(get(cells, "keywords"));
    const category = (get(cells, "category") ?? "").trim() || undefined;
    const usageTags = keywordsFromCell(get(cells, "usageTags"));
    rows.push({
      id,
      gtin: rawGtin && rawGtin.length >= 8 ? rawGtin : undefined,
      name,
      brand,
      keywords,
      category,
      usageTags,
      totalWeightG: toNum(get(cells, "totalWeightG")),
      unitsPerPack: toNum(get(cells, "unitsPerPack")),
      calories100: toNum(get(cells, "calories100")),
      protein100: toNum(get(cells, "protein100")),
      carbs100: toNum(get(cells, "carbs100")),
      fat100: toNum(get(cells, "fat100")),
      unitsPer100g: toNum(get(cells, "unitsPer100g")),
      tbspPer100g: toNum(get(cells, "tbspPer100g")),
      tspPer100g: toNum(get(cells, "tspPer100g")),
      cupsPer100g: toNum(get(cells, "cupsPer100g")),
    });
  }
  return rows;
}

