const OFF_API_ORIGINS = [
  "https://ssl-api.openfoodfacts.org",
  "https://us.openfoodfacts.org",
  "https://world.openfoodfacts.org",
] as const;

const OFF_PRODUCT_PATH = "/api/v0/product";

const OFF_REQUEST_HEADERS: HeadersInit = {
  Accept: "application/json",
  "User-Agent":
    "CaloricIntelligence/1.0 (+https://github.com/ilanitwin-kar/caloric-data-collector)",
};

export type OpenFoodFactsProduct = {
  productName: string;
  brand: string;
  quantityText?: string;
  quantityG?: number;
  packUnits?: number;
  servingSizeText?: string;
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
  addedSugars100?: number;
  satFat100?: number;
  transFat100?: number;
  fiber100?: number;
  sodiumMg100?: number;
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

  const m = s.match(/(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/);
  if (!m) return undefined;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const unit = m[2];
  if (unit === "g") return n;
  if (unit === "kg") return n * 1000;
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

function readProductQuantityGrams(product: Record<string, unknown>): number | undefined {
  const pq = readNum(product, ["product_quantity"]);
  const pqu = readStr(product, ["product_quantity_unit"]);
  if (pq === undefined || !pqu) return undefined;
  const u = pqu.toLowerCase();
  if (u === "g") return pq;
  if (u === "kg") return pq * 1000;
  if (u === "ml") return pq;
  if (u === "l" || u === "liter" || u === "litre") return pq * 1000;
  return undefined;
}

function nutrimentsFromProduct(product: Record<string, unknown>): OpenFoodFactsProduct {
  const nut = (product.nutriments ?? {}) as Record<string, unknown>;

  const pqG = readProductQuantityGrams(product);
  const quantityText = readStr(product, ["quantity"]);
  let quantityG = parseQuantityToGrams(quantityText);
  let packUnits: number | undefined = undefined;
  if (quantityText) {
    const qt = quantityText.replace(",", ".").replace(/×/g, "x");
    const mPack = qt.toLowerCase().match(
      /(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\b/i,
    );
    if (mPack) {
      const count = parseFloat(mPack[1]);
      const each = parseFloat(mPack[2]);
      const unit = mPack[3];
      if (Number.isFinite(count) && Number.isFinite(each) && count > 0 && each > 0) {
        packUnits = Math.round(count);
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
        if (eachG !== undefined) quantityG = Math.round(count * eachG);
      }
    }
    const mParenPack = qt.toLowerCase().match(
      /\(\s*(\d+(?:\.\d+)?)\s*x\s*(\d+(?:\.\d+)?)\s*(g|kg|ml|l)\s*\)/i,
    );
    if (mParenPack) {
      const count = parseFloat(mParenPack[1]);
      const each = parseFloat(mParenPack[2]);
      const unit = mParenPack[3];
      if (Number.isFinite(count) && Number.isFinite(each) && count > 0 && each > 0) {
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
        if (eachG !== undefined) {
          const fromParen = Math.round(count * eachG);
          packUnits = packUnits ?? Math.round(count);
          if (quantityG === undefined || quantityG < fromParen * 0.85) {
            quantityG = fromParen;
          }
        }
      }
    }
  }

  if (pqG !== undefined && pqG > 0) {
    if (quantityG === undefined) {
      quantityG = pqG;
    } else if (quantityG < pqG && (quantityG < 80 || pqG >= quantityG * 3)) {
      quantityG = pqG;
    }
  }

  const servingSizeText = readStr(product, ["serving_size"]);
  const servingG = parseQuantityToGrams(servingSizeText);

  if (
    quantityG !== undefined &&
    servingG !== undefined &&
    servingG > 0 &&
    quantityG >= servingG * 1.35
  ) {
    const ratio = quantityG / servingG;
    const n = Math.round(ratio);
    if (n >= 2 && n <= 200 && Math.abs(ratio - n) < 0.22) {
      packUnits ??= n;
    }
  }

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

export function normalizeBarcode(raw: string): string {
  return raw.replace(/\D/g, "");
}

export type OffSearchHit = {
  code: string;
  productName: string;
  brand: string;
  quantityText?: string;
};

export async function searchOpenFoodFactsProducts(
  query: string,
  pageSize = 16,
  timeoutMs = 20000,
): Promise<
  | { ok: true; results: OffSearchHit[] }
  | { ok: false; reason: "network" | "timeout" | "parse" | "blocked" }
> {
  const q = query.trim();
  if (q.length < 2) return { ok: true, results: [] };

  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  let sawThrottleHtml = false;

  try {
    for (const origin of OFF_API_ORIGINS) {
      const url = new URL(`${origin}/cgi/search.pl`);
      url.searchParams.set("search_terms", q);
      url.searchParams.set("search_simple", "1");
      url.searchParams.set("action", "process");
      url.searchParams.set("json", "1");
      url.searchParams.set("page_size", String(pageSize));

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          signal: ctrl.signal,
          headers: OFF_REQUEST_HEADERS,
        });
      } catch {
        continue;
      }

      if (!res.ok) continue;

      let text: string;
      try {
        text = await res.text();
      } catch {
        continue;
      }

      const head = text.trimStart();
      if (head.startsWith("<") || head.includes("Page temporarily unavailable")) {
        sawThrottleHtml = true;
        continue;
      }

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }

      const products = (json as { products?: unknown }).products;
      if (!Array.isArray(products)) continue;

      const results: OffSearchHit[] = [];
      for (const row of products) {
        if (typeof row !== "object" || row === null) continue;
        const p = row as Record<string, unknown>;
        const code = String(p.code ?? "").replace(/\D/g, "");
        if (code.length < 8) continue;
        const productName =
          typeof p.product_name === "string"
            ? p.product_name.trim()
            : typeof p.product_name_en === "string"
              ? p.product_name_en.trim()
              : "";
        const brandsRaw = typeof p.brands === "string" ? p.brands : "";
        const brand = brandsRaw.split(/[,;/]/)[0]?.trim() ?? "";
        const quantityText =
          typeof p.quantity === "string" ? p.quantity.trim() : undefined;
        results.push({
          code,
          productName: productName || "ללא שם",
          brand,
          quantityText,
        });
      }
      return { ok: true, results };
    }

    if (sawThrottleHtml) return { ok: false, reason: "blocked" };
    return { ok: false, reason: "network" };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "network" };
  } finally {
    window.clearTimeout(t);
  }
}

export async function fetchOpenFoodFactsProduct(
  barcode: string,
  timeoutMs = 15000,
): Promise<OffResult> {
  const code = normalizeBarcode(barcode);
  if (code.length < 8) return { ok: true, found: false };

  try {
    const ctrl = new AbortController();
    const t = window.setTimeout(() => ctrl.abort(), timeoutMs);

    let json: unknown | undefined;

    try {
      for (const origin of OFF_API_ORIGINS) {
        const url = `${origin}${OFF_PRODUCT_PATH}/${encodeURIComponent(code)}.json`;
        let res: Response;
        try {
          res = await fetch(url, {
            signal: ctrl.signal,
            headers: OFF_REQUEST_HEADERS,
          });
        } catch {
          continue;
        }
        if (!res.ok) continue;
        let text: string;
        try {
          text = await res.text();
        } catch {
          continue;
        }
        const head = text.trimStart();
        if (head.startsWith("<")) continue;
        try {
          json = JSON.parse(text);
        } catch {
          continue;
        }
        break;
      }
    } finally {
      window.clearTimeout(t);
    }

    if (json === undefined) return { ok: false, reason: "network" };

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
