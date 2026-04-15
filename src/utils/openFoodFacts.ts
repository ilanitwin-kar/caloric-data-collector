const OFF_PRODUCT_URL =
  "https://world.openfoodfacts.org/api/v0/product";

export type OpenFoodFactsProduct = {
  productName: string;
  brand: string;
  quantityText?: string;
  /** Parsed from OFF quantity when possible (grams or milliliters-as-grams). */
  quantityG?: number;
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

function nutrimentsFromProduct(product: Record<string, unknown>): OpenFoodFactsProduct {
  const nut = (product.nutriments ?? {}) as Record<string, unknown>;

  let cals100 = readNum(nut, [
    "energy-kcal_100g",
    "energy-kcal_value",
    "energy-kcal",
  ]);

  if (cals100 === undefined) {
    const kj = readNum(nut, [
      "energy-kj_100g",
      "energy_100g",
      "energy-kj_value",
    ]);
    if (kj !== undefined && kj > 200) cals100 = Math.round(kj / 4.184);
  }

  const prot100 = readNum(nut, ["proteins_100g", "proteins_value"]);
  const carb100 = readNum(nut, [
    "carbohydrates_100g",
    "carbohydrates_value",
  ]);
  const fat100 = readNum(nut, ["fat_100g", "fat_value"]);

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

  const quantityText = readStr(product, ["quantity"]);
  const quantityG = parseQuantityToGrams(quantityText);

  const servingSizeText = readStr(product, ["serving_size"]);
  const servingG = parseQuantityToGrams(servingSizeText);

  const ingredientsText =
    readStr(product, ["ingredients_text_he", "ingredients_text"]) ??
    undefined;

  const allergensText =
    readStr(product, ["allergens", "allergens_from_ingredients", "allergens_from_user", "allergens_hierarchy", "allergens_tags"]) ??
    undefined;

  const categoriesText =
    readStr(product, ["categories", "categories_hierarchy", "categories_tags"]) ??
    undefined;

  const imageFrontUrl = readStr(product, ["image_front_url", "image_url"]);
  const imageNutritionUrl = readStr(product, ["image_nutrition_url"]);
  const imageIngredientsUrl = readStr(product, ["image_ingredients_url"]);

  return {
    productName: nameRaw.trim(),
    brand,
    quantityText,
    quantityG,
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
