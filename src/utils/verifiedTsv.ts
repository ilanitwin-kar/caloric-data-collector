export type VerifiedPortionMeasures = {
  unitsPer100g?: number;
  tbspPer100g?: number;
  tspPer100g?: number;
  cupsPer100g?: number;
};

export type Verified100Row = {
  category?: string;
  brand?: string;
  name: string;
  protein100?: number;
  fat100?: number;
  carbs100?: number;
  calories100?: number;
  /** Ministry of Health food code (data.gov.il). */
  ministryCode?: number;
  unitWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  measures?: VerifiedPortionMeasures;
};

function normalizeHeader(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/[׳"״']/g, "")
    .replace(/[(){}\[\],.:;!?/\\\-–—_]+/g, " ")
    .replace(/\s+/g, " ");
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

function splitDelimitedLine(line: string, delimiter: "," | ";"): string[] {
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
    if (ch === delimiter) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  out.push(cur);
  return out.map((x) => x.trim());
}

export function parseVerifiedTsv(text: string): Verified100Row[] {
  const lines = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const splitter =
    lines[0].includes("\t")
      ? splitTsvLine
      : lines[0].includes(";")
        ? (line: string) => splitDelimitedLine(line, ";")
        : lines[0].includes(",")
          ? (line: string) => splitDelimitedLine(line, ",")
          : splitTsvLine;

  const header = splitter(lines[0]).map(normalizeHeader);
  const idx = (labels: string[]) =>
    labels
      .map((label) => header.indexOf(normalizeHeader(label)))
      .find((i) => i >= 0) ?? -1;
  const get = (cells: string[], labels: string[]) => {
    const i = idx(labels);
    return i >= 0 ? cells[i] : undefined;
  };

  // Support common Hebrew + English header variants (exports from Sheets/Excel/APIs).
  const categoryLabels = ["קטגוריה", "קטגוריה ראשית", "category", "main category"];
  const brandLabels = [
    "מותג/חברה",
    "מותג",
    "חברה",
    "יצרן",
    "brand",
    "manufacturer",
    "company",
    "producer",
  ];
  const nameLabels = [
    "שם המוצר",
    "שם מוצר",
    "מוצר",
    "תיאור",
    "name",
    "product name",
    "item",
    "description",
    "title",
  ];
  const proteinLabels = ["חלבון", "חלבונים", "protein", "protein g", "protein_g"];
  const fatLabels = ["שומן", "שומנים", "fat", "total fat", "fat g", "fat_g"];
  const carbsLabels = [
    "פחמימה",
    "פחמימות",
    "carb",
    "carbs",
    "carbohydrate",
    "carbohydrates",
    "carbs g",
    "carbs_g",
  ];
  const caloriesLabels = ["קלוריות", "אנרגיה", "calories", "kcal", "energy", "energy kcal"];

  const rows: Verified100Row[] = [];
  for (let i = 1; i < lines.length; i++) {
    const cells = splitter(lines[i]);
    const name = (get(cells, nameLabels) ?? "").trim();
    if (!name) continue;
    rows.push({
      category: (get(cells, categoryLabels) ?? "").trim() || undefined,
      brand: (get(cells, brandLabels) ?? "").trim() || undefined,
      name,
      protein100: toNum(get(cells, proteinLabels)),
      fat100: toNum(get(cells, fatLabels)),
      carbs100: toNum(get(cells, carbsLabels)),
      calories100: toNum(get(cells, caloriesLabels)),
    });
  }
  return rows;
}

/** Match score for verified row vs query (same logic as Verified100Context). */
export function scoreVerifiedMatch(
  item: Verified100Row,
  q: { name: string; brand?: string },
): number {
  const nameQ = normalizeText(q.name);
  const brandQ = normalizeText(q.brand ?? "");
  const nameI = normalizeText(item.name);
  const brandI = normalizeText(item.brand ?? "");

  if (!nameQ) return 0;
  let score = 0;

  const tokens = nameQ.split(" ").filter(Boolean);
  let hit = 0;
  for (const t of tokens) {
    if (t.length < 2) continue;
    if (nameI.includes(t)) hit += 1;
  }
  score += Math.min(6, hit) * 10;

  if (nameI.includes(nameQ) || nameQ.includes(nameI)) score += 25;

  if (brandQ && brandI) {
    if (brandI === brandQ) score += 18;
    else if (brandI.includes(brandQ) || brandQ.includes(brandI)) score += 10;
  }

  return score;
}

/** Minimum score to auto-apply verified nutrition over OFF on import. */
export const VERIFIED_AUTO_APPLY_MIN_SCORE = 55;

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

