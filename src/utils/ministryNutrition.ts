import type { Verified100Row } from "./verifiedTsv";

export const MINISTRY_FOODS_RESOURCE = "c3cb0630-0650-46c1-a068-82d575c094b2";
export const MINISTRY_WEIGHTS_RESOURCE = "755d28c0-75f7-40e1-9c8c-ecdd106f9b2d";
export const MINISTRY_UNITS_RESOURCE = "98fb46fe-e8de-4067-94d2-b0a8ea4269da";

const DATA_GOV_BASE = "https://data.gov.il/api/3/action/datastore_search";
const MAX_PORTION_LINES = 20;

export type MinistryFoodKind = "ingredient" | "recipe" | "industry";

export type MinistryPortionRole =
  | "unit"
  | "slice"
  | "serving"
  | "cup"
  | "tbsp"
  | "tsp"
  | "pack"
  | "other";

export type MinistryPortionLine = {
  midaCode: string;
  label: string;
  grams: number;
  role: MinistryPortionRole;
};

export type MinistryVerifiedRow = Verified100Row & {
  ministryCode: number;
  ministryKind: MinistryFoodKind;
  portionLines: MinistryPortionLine[];
  unitWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  servingWeightG?: number;
  measures?: {
    unitsPer100g?: number;
    tbspPer100g?: number;
    tspPer100g?: number;
    cupsPer100g?: number;
  };
};

const ROLE_PICK_ORDER: MinistryPortionRole[] = [
  "unit",
  "slice",
  "serving",
  "pack",
  "cup",
  "tbsp",
  "tsp",
];

const MIDA_CODES_BY_ROLE: Record<Exclude<MinistryPortionRole, "other">, readonly string[]> = {
  unit: ["100", "101", "102", "103", "104", "105", "106", "107"],
  slice: ["500", "501", "502", "503"],
  serving: ["800", "801", "802", "803"],
  cup: ["200", "201", "202", "203", "204", "205", "206", "207", "208", "209", "600", "601", "602", "603", "604", "605"],
  tbsp: ["300", "301", "302", "304", "308"],
  tsp: ["400", "401", "402"],
  pack: [
    "900", "901", "902", "903", "904", "905", "906", "907", "908", "909", "910", "911", "912",
    "1100", "1101", "1102", "1103", "1104", "1105", "1106",
  ],
};

export function ministryKindLabel(kind: MinistryFoodKind | undefined): string {
  if (kind === "recipe") return "מתכון";
  if (kind === "industry") return "תעשייה";
  return "מצרך";
}

export function midaRole(code: string): MinistryPortionRole {
  const n = parseInt(code, 10);
  if (!Number.isFinite(n)) return "other";
  if (n >= 100 && n <= 107) return "unit";
  if (n >= 500 && n <= 503) return "slice";
  if (n >= 800 && n <= 803) return "serving";
  if ((n >= 200 && n <= 209) || (n >= 600 && n <= 605)) return "cup";
  if (n >= 300 && n <= 308) return "tbsp";
  if (n >= 400 && n <= 402) return "tsp";
  if ((n >= 900 && n <= 912) || (n >= 1100 && n <= 1106)) return "pack";
  return "other";
}

function gramsToPer100g(grams: number | undefined): number | undefined {
  if (grams == null || !Number.isFinite(grams) || grams <= 0) return undefined;
  return 100 / grams;
}

function pickGrams(map: Map<string, number>, codes: readonly string[]): number | undefined {
  for (const code of codes) {
    const g = map.get(code);
    if (g != null && g > 0) return g;
  }
  return undefined;
}

function parseFoodCode(raw: unknown): number | null {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parsePositiveNum(raw: unknown): number | undefined {
  const n = typeof raw === "number" ? raw : parseFloat(String(raw ?? "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

export function parseMinistryKind(makor: unknown): MinistryFoodKind {
  const n = typeof makor === "number" ? makor : parseInt(String(makor ?? ""), 10);
  if (n === 4) return "recipe";
  if (n === 2) return "industry";
  return "ingredient";
}

export function buildMinistryUnitLabels(
  unitRecords: Record<string, unknown>[],
): Map<string, string> {
  const labels = new Map<string, string>();
  for (const row of unitRecords) {
    const code = String(row.smlmida ?? row.mida ?? "").trim();
    const label = String(row.shmmida ?? row.name ?? "").trim();
    if (code && label) labels.set(code, label);
  }
  return labels;
}

function buildPortionLines(
  weightMap: Map<string, number>,
  unitLabels: Map<string, string>,
): MinistryPortionLine[] {
  const lines: MinistryPortionLine[] = [];
  for (const [midaCode, grams] of weightMap.entries()) {
    if (!(grams > 0)) continue;
    const role = midaRole(midaCode);
    const label = unitLabels.get(midaCode) ?? (role === "other" ? `מידה ${midaCode}` : roleLabelFallback(role));
    lines.push({ midaCode, label, grams, role });
  }
  lines.sort((a, b) => {
    const ra = ROLE_PICK_ORDER.indexOf(a.role === "other" ? "tsp" : a.role);
    const rb = ROLE_PICK_ORDER.indexOf(b.role === "other" ? "tsp" : b.role);
    if (ra !== rb) return ra - rb;
    return a.midaCode.localeCompare(b.midaCode);
  });
  return lines.slice(0, MAX_PORTION_LINES);
}

function roleLabelFallback(role: MinistryPortionRole): string {
  switch (role) {
    case "unit":
      return "יחידה";
    case "slice":
      return "פרוסה";
    case "serving":
      return "מנה";
    case "cup":
      return "כוס";
    case "tbsp":
      return "כף";
    case "tsp":
      return "כפית";
    case "pack":
      return "אריזה";
    default:
      return "מידה";
  }
}

export function ministryPortionHintFromLines(lines: MinistryPortionLine[] | undefined): string | null {
  if (!lines?.length) return null;
  const parts: string[] = [];
  for (const line of lines.slice(0, 4)) {
    parts.push(`${line.label} ~${Math.round(line.grams)}g`);
  }
  return parts.join(" · ");
}

export async function fetchMinistryDatastoreRecords(
  resourceId: string,
  signal?: AbortSignal,
): Promise<Record<string, unknown>[]> {
  const all: Record<string, unknown>[] = [];
  let offset = 0;
  const limit = 32000;
  for (;;) {
    const url = `${DATA_GOV_BASE}?resource_id=${encodeURIComponent(resourceId)}&limit=${limit}&offset=${offset}`;
    let res: Response;
    try {
      res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") throw e;
      throw new Error("לא הצלחנו להתחבר ל-data.gov.il");
    }
    if (!res.ok) throw new Error(`data.gov.il החזיר ${res.status}`);
    const json = (await res.json()) as {
      success?: boolean;
      result?: { records?: Record<string, unknown>[]; total?: number };
    };
    if (!json.success || !json.result) throw new Error("תשובה לא תקינה מ-data.gov.il");
    const records = json.result.records ?? [];
    all.push(...records);
    const total = json.result.total ?? records.length;
    if (records.length === 0 || offset + records.length >= total) break;
    offset += limit;
  }
  return all;
}

export function buildMinistryWeightIndex(
  weightRecords: Record<string, unknown>[],
): Map<string, Map<string, number>> {
  const index = new Map<string, Map<string, number>>();
  for (const row of weightRecords) {
    const code = String(row.mmitzrach ?? "").trim();
    const mida = String(row.mida ?? "").trim();
    const grams = parsePositiveNum(row.mishkal);
    if (!code || !mida || grams == null) continue;
    let inner = index.get(code);
    if (!inner) {
      inner = new Map();
      index.set(code, inner);
    }
    inner.set(mida, grams);
  }
  return index;
}

export function ministryFoodToVerifiedRow(
  food: Record<string, unknown>,
  weightIndex: Map<string, Map<string, number>>,
  unitLabels: Map<string, string>,
): MinistryVerifiedRow | null {
  const code = parseFoodCode(food.Code ?? food.code);
  if (code == null) return null;
  const name = String(food.shmmitzrach ?? "").trim();
  if (!name) return null;

  const ministryKind = parseMinistryKind(food.makor);
  const weightMap = weightIndex.get(String(code)) ?? new Map<string, number>();
  const portionLines = buildPortionLines(weightMap, unitLabels);

  const unitG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.unit);
  const sliceG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.slice);
  const servingG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.serving);
  const tbspG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.tbsp);
  const tspG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.tsp);
  const cupG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.cup);
  const packG = pickGrams(weightMap, MIDA_CODES_BY_ROLE.pack);

  const primaryUnitG = unitG ?? sliceG ?? servingG;

  const measures = {
    ...(primaryUnitG ? { unitsPer100g: gramsToPer100g(primaryUnitG) } : {}),
    ...(tbspG ? { tbspPer100g: gramsToPer100g(tbspG) } : {}),
    ...(tspG ? { tspPer100g: gramsToPer100g(tspG) } : {}),
    ...(cupG ? { cupsPer100g: gramsToPer100g(cupG) } : {}),
  };

  const unitsPerPack =
    packG && primaryUnitG && primaryUnitG > 0
      ? Math.max(1, Math.round(packG / primaryUnitG))
      : undefined;

  const storeNutrition = ministryKind === "recipe";

  return {
    ministryCode: code,
    ministryKind,
    portionLines,
    name,
    category: undefined,
    brand: undefined,
    ...(storeNutrition && parsePositiveNum(food.protein) != null
      ? { protein100: parsePositiveNum(food.protein) }
      : {}),
    ...(storeNutrition && parsePositiveNum(food.total_fat) != null
      ? { fat100: parsePositiveNum(food.total_fat) }
      : {}),
    ...(storeNutrition && parsePositiveNum(food.carbohydrates) != null
      ? { carbs100: parsePositiveNum(food.carbohydrates) }
      : {}),
    ...(storeNutrition && parsePositiveNum(food.food_energy) != null
      ? { calories100: parsePositiveNum(food.food_energy) }
      : {}),
    ...(primaryUnitG ? { unitWeightG: primaryUnitG } : {}),
    ...(servingG ? { servingWeightG: servingG } : {}),
    ...(packG ? { packWeightG: packG } : {}),
    ...(unitsPerPack ? { unitsPerPack } : {}),
    ...(Object.keys(measures).length > 0 ? { measures } : {}),
  };
}

export async function fetchMinistryVerifiedRows(signal?: AbortSignal): Promise<MinistryVerifiedRow[]> {
  const [foods, weights, units] = await Promise.all([
    fetchMinistryDatastoreRecords(MINISTRY_FOODS_RESOURCE, signal),
    fetchMinistryDatastoreRecords(MINISTRY_WEIGHTS_RESOURCE, signal),
    fetchMinistryDatastoreRecords(MINISTRY_UNITS_RESOURCE, signal),
  ]);
  const weightIndex = buildMinistryWeightIndex(weights);
  const unitLabels = buildMinistryUnitLabels(units);
  const rows: MinistryVerifiedRow[] = [];
  for (const food of foods) {
    const row = ministryFoodToVerifiedRow(food, weightIndex, unitLabels);
    if (row) rows.push(row);
  }
  return rows;
}

export function ministryKindSortPenalty(kind: MinistryFoodKind | undefined): number {
  if (kind === "recipe") return 25;
  if (kind === "industry") return 5;
  return 0;
}
