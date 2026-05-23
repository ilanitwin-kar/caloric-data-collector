import type { Verified100Row } from "./verifiedTsv";

export const MINISTRY_FOODS_RESOURCE = "c3cb0630-0650-46c1-a068-82d575c094b2";
export const MINISTRY_WEIGHTS_RESOURCE = "755d28c0-75f7-40e1-9c8c-ecdd106f9b2d";
export const MINISTRY_UNITS_RESOURCE = "98fb46fe-e8de-4067-94d2-b0a8ea4269da";

const DATA_GOV_BASE = "https://data.gov.il/api/3/action/datastore_search";

/** Ministry unit codes → app measure (see 98fb46fe). */
const MIDA_UNIT = ["100", "101", "102", "103", "104", "105", "800", "801", "802", "803", "600", "601", "602", "603", "604", "605"] as const;
const MIDA_TBSP = ["300", "301", "302", "304", "308"] as const;
const MIDA_TSP = ["400", "401", "402"] as const;
const MIDA_CUP = ["200", "201", "202", "203", "204", "205", "206", "207", "208", "209"] as const;
const MIDA_PACK = ["900", "901", "902", "903", "904", "905", "906", "907", "908", "909", "910", "911", "912"] as const;

export type MinistryVerifiedRow = Verified100Row & {
  ministryCode: number;
  unitWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  measures?: {
    unitsPer100g?: number;
    tbspPer100g?: number;
    tspPer100g?: number;
    cupsPer100g?: number;
  };
};

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
): MinistryVerifiedRow | null {
  const code = parseFoodCode(food.Code ?? food.code);
  if (code == null) return null;
  const name = String(food.shmmitzrach ?? "").trim();
  if (!name) return null;

  const weightMap = weightIndex.get(String(code)) ?? new Map<string, number>();
  const unitG = pickGrams(weightMap, MIDA_UNIT);
  const tbspG = pickGrams(weightMap, MIDA_TBSP);
  const tspG = pickGrams(weightMap, MIDA_TSP);
  const cupG = pickGrams(weightMap, MIDA_CUP);
  const packG = pickGrams(weightMap, MIDA_PACK);

  const measures = {
    ...(unitG ? { unitsPer100g: gramsToPer100g(unitG) } : {}),
    ...(tbspG ? { tbspPer100g: gramsToPer100g(tbspG) } : {}),
    ...(tspG ? { tspPer100g: gramsToPer100g(tspG) } : {}),
    ...(cupG ? { cupsPer100g: gramsToPer100g(cupG) } : {}),
  };

  const unitsPerPack =
    packG && unitG && unitG > 0 ? Math.max(1, Math.round(packG / unitG)) : undefined;

  return {
    ministryCode: code,
    name,
    category: undefined,
    brand: undefined,
    protein100: parsePositiveNum(food.protein),
    fat100: parsePositiveNum(food.total_fat),
    carbs100: parsePositiveNum(food.carbohydrates),
    calories100: parsePositiveNum(food.food_energy),
    ...(unitG ? { unitWeightG: unitG } : {}),
    ...(packG ? { packWeightG: packG } : {}),
    ...(unitsPerPack ? { unitsPerPack } : {}),
    ...(Object.keys(measures).length > 0 ? { measures } : {}),
  };
}

export async function fetchMinistryVerifiedRows(signal?: AbortSignal): Promise<MinistryVerifiedRow[]> {
  const [foods, weights] = await Promise.all([
    fetchMinistryDatastoreRecords(MINISTRY_FOODS_RESOURCE, signal),
    fetchMinistryDatastoreRecords(MINISTRY_WEIGHTS_RESOURCE, signal),
  ]);
  const weightIndex = buildMinistryWeightIndex(weights);
  const rows: MinistryVerifiedRow[] = [];
  for (const food of foods) {
    const row = ministryFoodToVerifiedRow(food, weightIndex);
    if (row) rows.push(row);
  }
  return rows;
}
