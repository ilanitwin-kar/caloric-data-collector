import type { CatalogProduct } from "../context/CatalogContext";

function escapeCsvCell(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = parseFloat(v.replace(",", ".").trim());
  return Number.isFinite(n) ? n : undefined;
}

export function catalogToCsv(items: CatalogProduct[]): string {
  const headers = [
    "gtin",
    "name",
    "brand",
    "totalWeightG",
    "unitsPerPack",
    "calories100",
    "protein100",
    "carbs100",
    "sugars100",
    "fat100",
    "satFat100",
    "fiber100",
    "sodiumMg100",
    "ingredientsText",
    "allergensText",
    "categoriesText",
  ];
  const lines = [headers.join(",")];
  for (const p of items) {
    const per = p.nutrition?.per100g;
    lines.push(
      [
        escapeCsvCell(p.gtin),
        escapeCsvCell(p.name ?? ""),
        escapeCsvCell(p.brand ?? ""),
        String(p.package?.totalWeightG ?? ""),
        String(p.package?.unitsPerPack ?? ""),
        String(per?.calories ?? ""),
        String(per?.proteinG ?? ""),
        String(per?.carbsG ?? ""),
        String(per?.sugarsG ?? ""),
        String(per?.fatG ?? ""),
        String(per?.satFatG ?? ""),
        String(per?.fiberG ?? ""),
        String(per?.sodiumMg ?? ""),
        escapeCsvCell(p.ingredientsText ?? ""),
        escapeCsvCell(p.allergensText ?? ""),
        escapeCsvCell(p.categoriesText ?? ""),
      ].join(","),
    );
  }
  return "\uFEFF" + lines.join("\r\n");
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

export type CatalogCsvRow = {
  gtin: string;
  name: string;
  brand?: string;
  totalWeightG?: number;
  unitsPerPack?: number;
  calories100?: number;
  protein100?: number;
  carbs100?: number;
  sugars100?: number;
  fat100?: number;
  satFat100?: number;
  fiber100?: number;
  sodiumMg100?: number;
  ingredientsText?: string;
  allergensText?: string;
  categoriesText?: string;
};

export function parseCatalogCsv(csv: string): CatalogCsvRow[] {
  const raw = csv.replace(/^\uFEFF/, "");
  const lines = raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headerCells = splitCsvLine(lines[0]).map(normalizeHeader);

  const idx = (name: string) => headerCells.indexOf(normalizeHeader(name));
  const get = (cells: string[], name: string) => {
    const i = idx(name);
    return i >= 0 ? cells[i] : undefined;
  };

  const rows: CatalogCsvRow[] = [];
  for (let r = 1; r < lines.length; r++) {
    const cells = splitCsvLine(lines[r]);
    const gtin = (get(cells, "gtin") ?? "").replace(/\D/g, "");
    const name = (get(cells, "name") ?? "").trim();
    if (!gtin || gtin.length < 8 || !name) continue;
    const brand = (get(cells, "brand") ?? "").trim() || undefined;
    const totalWeightG = toNum(get(cells, "totalWeightG"));
    const unitsPerPack = toNum(get(cells, "unitsPerPack"));
    rows.push({
      gtin,
      name,
      brand,
      totalWeightG,
      unitsPerPack,
      calories100: toNum(get(cells, "calories100")),
      protein100: toNum(get(cells, "protein100")),
      carbs100: toNum(get(cells, "carbs100")),
      sugars100: toNum(get(cells, "sugars100")),
      fat100: toNum(get(cells, "fat100")),
      satFat100: toNum(get(cells, "satFat100")),
      fiber100: toNum(get(cells, "fiber100")),
      sodiumMg100: toNum(get(cells, "sodiumMg100")),
      ingredientsText: (get(cells, "ingredientsText") ?? "").trim() || undefined,
      allergensText: (get(cells, "allergensText") ?? "").trim() || undefined,
      categoriesText: (get(cells, "categoriesText") ?? "").trim() || undefined,
    });
  }
  return rows;
}

