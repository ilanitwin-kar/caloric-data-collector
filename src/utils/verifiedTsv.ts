export type Verified100Row = {
  category?: string;
  brand?: string;
  name: string;
  protein100?: number;
  fat100?: number;
  carbs100?: number;
  calories100?: number;
};

function normalizeHeader(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

function toNum(raw: string | undefined): number | undefined {
  if (!raw) return undefined;
  const s = raw.replace(",", ".").trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : undefined;
}

function splitTsvLine(line: string): string[] {
  // Supports true TSV; also tolerates multiple spaces.
  if (line.includes("\t")) return line.split("\t").map((x) => x.trim());
  return line.split(/\s{2,}/).map((x) => x.trim());
}

export function parseVerifiedTsv(text: string): Verified100Row[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const header = splitTsvLine(lines[0]).map(normalizeHeader);
  const idx = (label: string) => header.indexOf(normalizeHeader(label));
  const get = (cells: string[], label: string) => {
    const i = idx(label);
    return i >= 0 ? cells[i] : undefined;
  };

  const rows: Verified100Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitTsvLine(lines[i]);
    const name = (get(cells, "שם המוצר") ?? "").trim();
    if (!name) continue;
    rows.push({
      category: (get(cells, "קטגוריה") ?? "").trim() || undefined,
      brand: (get(cells, "מותג/חברה") ?? "").trim() || undefined,
      name,
      protein100: toNum(get(cells, "חלבון")),
      fat100: toNum(get(cells, "שומן")),
      carbs100: toNum(get(cells, "פחמימה")),
      calories100: toNum(get(cells, "קלוריות")),
    });
  }
  return rows;
}

export function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .replace(/[׳"״']/g, "")
    .replace(/[(){}\[\],.:;!?/\\\-–—_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function stableId(brand: string | undefined, name: string): string {
  const key = `${normalizeText(brand ?? "")}|${normalizeText(name)}`;
  // Simple deterministic hash to keep RTDB keys short.
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `v_${(h >>> 0).toString(36)}`;
}

