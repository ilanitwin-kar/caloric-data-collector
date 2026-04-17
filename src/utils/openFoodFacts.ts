const OFF_PRODUCT_URL =
  "https://world.openfoodfacts.org/api/v0/product";

export type OpenFoodFactsProduct = {
  productName: string;
  brand: string;
  quantityText?: string;
  /** Parsed from OFF quantity when possible (grams or milliliters-as-grams). */
  quantityG?: number;
  /**
   * Best-effort: number of retail units inside the package when parseable
   * (e.g. quantity text like "6 x 40 g").
   */
  packUnits?: number;
  servingSizeText?: string;
  /** Parsed grams/ml from serving size (best-effort). */
  servingG?: number;
  ingredientsText?: string;
  allergensText?: string;
  categoriesText?: string;
  imageFrontUrl?: string;
  imageNutritionUrl?: string;
  imageIngredientsUrl?: string;
  cals100?: number;
  prot100?: number;
  carb100?: number;
  fat100?: number;
  sugars100?: number;
  /** Added sugars per 100g when available (preferred for "כפיות סוכר"). */
  addedSugars100?: number;
  satFat100?: number;
  transFat100?: number;
  fiber100?: number;
  /** Sodium in mg per 100g (best-effort; may be derived from salt). */
  sodiumMg100?: number;
  /**
   * Approximate teaspoons of added sugars per 100g (1 tsp ≈ 4.2g sucrose).
   * Only filled when added sugars exist; otherwise may fall back to total sugars if added is missing.
   */
  sugarTeaspoons100?: number;
};

type OffResult =
  | { ok: true; found: true; data: OpenFoodFactsProduct }
  | { ok: true; found: false }
  | { ok: false; reason: "network" | "timeout" | "parse" };

function readNum(n: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = n[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const p = parseFloat(v.replace(",", "."));
      if (Number.isFinite(p)) return p;
    }
  }
  return undefined;
}

function readStr(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string") {
      const s = v.trim();
      if (s) return s;
    }
  }
  return undefined;
}

function readStrList(
  o: Record<string, unknown>,
  keys: string[],
): string[] | undefined {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v)) {
      const out = v
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
      if (out.length) return out;
    }
  }
  return undefined;
}

function tagsToReadable(tags?: string[], prefix?: string): string | undefined {
  if (!tags?.length) return undefined;
  const p = prefix ? `${prefix}:` : "";
  const parts = tags
    .map((t) => t.replace(/^[^:]+:\s*/, "").replace(/-/g, " ").trim())
    .filter(Boolean);
  if (!parts.length) return undefined;
  // De-dupe while keeping order
  const seen = new Set<string>();
  const uniq: string[] = [];
  for (const x of parts) {
    const key = `${p}${x}`.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push(`${p}${x}`);
  }
  return uniq.join(", ");
}

function parseQuantityToGrams(raw?: string): number | undefined {
  if (!raw) return undefined;
  const s = raw
    .replace(/\s+/g, " ")
    .replace(",", ".")
    .trim()
    .toLowerCase();
  if (!s) return undefined;

  // Examples: "500 g", "1 kg", "330ml", "0.5 l"
  const m = s.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = m[2];
  if (unit === "g") return n;
  if (unit === "kg") return n * 1000;
  // For our per-100g normalization we treat ml as grams (rough approximation).
  if (unit === "ml") return n;
  if (unit === "l") return n * 1000;
  return undefined;
}

function per100FromServing(
  nut: Record<string, unknown>,
  servingG: number | undefined,
  keys100: string[],
  keysServing: string[],
): number | undefined {
  const v100 = readNum(nut, keys100);
  if (v100 !== undefined) return v100;
  if (!servingG || servingG <= 0) return undefined;
  const vs = readNum(nut, keysServing);
  if (vs === undefined) return undefined;
  return (vs / servingG) * 100;
}

function nutrimentsFromProduct(product: Record<string, unknown>): OpenFoodFactsProduct {
  const nut = (product.nutriments ?? {}) as Record<string, unknown>;

  const quantityText = readStr(product, ["quantity"]);
  let quantityG = parseQuantityToGrams(quantityText);
  let packUnits: number | undefined = undefined;
  if (quantityText) {
    const mPack = quantityText
      .replace(",", ".")
      .replace(/×/g, "x")
      .toLowerCase()
      .match(
        /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/i,
      );
    if (mPack) {
      const count = parseFloat(mPack[1]);
      const each = parseFloat(mPack[2]);
      const unit = mPack[3];
      if (Number.isFinite(count) && Number.isFinite(each) && count > 0 && each > 0) {
        packUnits = count;
        const eachG =
          unit === "g"
            ? each
            : unit === "kg"
              ? each * 1000
              : unit === "ml"
                ? each
                : unit === "l"
                  ? each * 1000
                  : undefined;
        if (eachG !== undefined) quantityG = count * eachG;
      }
    }
  }
  if (quantityG === undefined) {
    const pq = readNum(product, ["product_quantity"]);
    const pqu = readStr(product, ["product_quantity_unit"]);
    if (pq !== undefined && pqu) {
      const u = pqu.toLowerCase();
      if (u === "g") quantityG = pq;
      else if (u === "kg") quantityG = pq * 1000;
      else if (u === "ml") quantityG = pq;
      else if (u === "l" || u === "liter" || u === "litre") quantityG = pq * 1000;
    }
  }

  const servingSizeText = readStr(product, ["serving_size"]);
  const servingG = parseQuantityToGrams(servingSizeText);

  // Prefer explicit *_100g fields so we never mix in per-serving "value" fields by mistake.
  let cals100 = per100FromServing(nut, servingG, ["energy-kcal_100g"], ["energy-kcal_serving"]);
  if (cals100 === undefined) {
    const kj100 = readNum(nut, ["energy-kj_100g"]);
    if (kj100 !== undefined && kj100 > 200) cals100 = Math.round(kj100 / 4.184);
  }
  if (cals100 === undefined && servingG && servingG > 0) {
    const kjS = readNum(nut, ["energy-kj_serving"]);
    if (kjS !== undefined && kjS > 50) {
      cals100 = Math.round(((kjS / servingG) * 100) / 4.184);
    }
  }

  const prot100 = per100FromServing(nut, servingG, ["proteins_100g"], ["proteins_serving"]);
  const carb100 = per100FromServing(nut, servingG, ["carbohydrates_100g"], ["carbohydrates_serving"]);
  const fat100 = per100FromServing(nut, servingG, ["fat_100g"], ["fat_serving"]);
  const sugars100 = per100FromServing(nut, servingG, ["sugars_100g"], ["sugars_serving"]);
  const addedSugars100 = per100FromServing(nut, servingG, ["added-sugars_100g", "added_sugars_100g"], ["added-sugars_serving"]);
  const satFat100 = per100FromServing(nut, servingG, ["saturated-fat_100g", "saturated_fat_100g"], ["saturated-fat_serving", "saturated_fat_serving"]);
  const transFat100 = per100FromServing(nut, servingG, ["trans-fat_100g", "trans_fat_100g"], ["trans-fat_serving", "trans_fat_serving"]);
  const fiber100 = per100FromServing(nut, servingG, ["fiber_100g"], ["fiber_serving"]);

  let sodiumMg100 = readNum(nut, ["sodium_100g"]);
  if (sodiumMg100 !== undefined && sodiumMg100 > 0 && sodiumMg100 <= 10) {
    sodiumMg100 = sodiumMg100 * 1000;
  }
  if (sodiumMg100 === undefined) {
    const saltG = readNum(nut, ["salt_100g"]);
    if (saltG !== undefined) sodiumMg100 = saltG * 1000 * 0.4;
  }
  if (sodiumMg100 === undefined && servingG && servingG > 0) {
    let sServ = readNum(nut, ["sodium_serving"]);
    if (sServ !== undefined && sServ > 0 && sServ <= 10) sServ *= 1000;
    if (sServ !== undefined) sodiumMg100 = (sServ / servingG) * 100;
    if (sodiumMg100 === undefined) {
      const saltS = readNum(nut, ["salt_serving"]);
      if (saltS !== undefined) sodiumMg100 = ((saltS / servingG) * 100) * 1000 * 0.4;
    }
  }

  const sugarBaseG = addedSugars100 ?? sugars100;
  const sugarTeaspoons100 =
    sugarBaseG !== undefined ? sugarBaseG / 4.2 : undefined;

  const nameRaw =
    (typeof product.product_name === "string" && product.product_name) ||
    (typeof product.product_name_en === "string" && product.product_name_en) ||
    (typeof product.generic_name === "string" && product.generic_name) ||
    "";

  const brandsRaw = typeof product.brands === "string" ? product.brands : "";
  const brand =
    brandsRaw
      .split(/[,;/]/)[0]
      ?.trim() ?? "";

  const ingredientsText =
    readStr(product, [
      "ingredients_text_he",
      "ingredients_text",
      "ingredients_text_with_allergens",
    ]) ??
    undefined;

  const allergenTags = readStrList(product, ["allergens_tags"]);
  const allergensFromTags = tagsToReadable(allergenTags);
  const allergensText =
    allergensFromTags ??
    readStr(product, ["allergens", "allergens_from_ingredients", "allergens_from_user"]) ??
    undefined;

  const categoryTags = readStrList(product, ["categories_tags"]);
  const categoriesFromTags = tagsToReadable(categoryTags);
  const categoriesText =
    categoriesFromTags ?? readStr(product, ["categories"]) ?? undefined;

  const imageFrontUrl = readStr(product, ["image_front_url", "image_url"]);
  const imageNutritionUrl = readStr(product, ["image_nutrition_url"]);
  const imageIngredientsUrl = readStr(product, ["image_ingredients_url"]);

  return {
    productName: nameRaw.trim(),
    brand,
    quantityText,
    quantityG,
    packUnits,
    servingSizeText,
    servingG,
    ingredientsText,
    allergensText,
    categoriesText,
    imageFrontUrl,
    imageNutritionUrl,
    imageIngredientsUrl,
    cals100,
    prot100,
    carb100,
    fat100,
    sugars100,
    addedSugars100,
    satFat100,
    transFat100,
    fiber100,
    sodiumMg100,
    sugarTeaspoons100,
  };
}

/** מנקה קוד מוצר — ספרות בלבד */
export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

/**
 * מביא מוצר מ-Open Food Facts. לא זורק חריגות — במקרה של תקלת רשת מחזיר ok: false.
 */
export async function fetchOpenFoodFactsProduct(
  barcode: string,
  timeoutMs = 15000,
): Promise<OffResult> {
  const code = normalizeBarcode(barcode);
  if (code.length < 8) return { ok: true, found: false };

  const url = `${OFF_PRODUCT_URL}/${encodeURIComponent(code)}.json`;

  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { Accept: "application/json" },
    });
    window.clearTimeout(t);

    if (!res.ok) return { ok: false, reason: "network" };

    let json: unknown;
    try {
      json = await res.json();
    } catch {
      return { ok: false, reason: "parse" };
    }

    if (
      typeof json !== "object" ||
      json === null ||
      !("status" in json) ||
      typeof (json as { status: unknown }).status !== "number"
    ) {
      return { ok: false, reason: "parse" };
    }

    const status = (json as { status: number }).status;
    if (status !== 1) return { ok: true, found: false };

    const product = (json as { product?: unknown }).product;
    if (typeof product !== "object" || product === null) {
      return { ok: true, found: false };
    }

    const data = nutrimentsFromProduct(product as Record<string, unknown>);
    return { ok: true, found: true, data };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network" };
  }
}
