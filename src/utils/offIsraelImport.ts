import {
  OFF_API_ORIGINS,
  OFF_REQUEST_HEADERS,
  normalizeBarcode,
  offProductHasNutrition,
  parseOffProductRecord,
} from "./openFoodFacts";

export type OffIsraelPageProgress = {
  page: number;
  productsOnPage: number;
  totalSeen: number;
};

export type FetchOffIsraelPagesOpts = {
  pageSize?: number;
  maxPages?: number;
  delayMs?: number;
  signal?: AbortSignal;
  onPage?: (p: OffIsraelPageProgress) => void;
};

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }
    const t = window.setTimeout(resolve, ms);
    signal?.addEventListener(
      "abort",
      () => {
        window.clearTimeout(t);
        reject(new DOMException("Aborted", "AbortError"));
      },
      { once: true },
    );
  });
}

/**
 * Paginates Open Food Facts search for products tagged with Israel.
 * Yields raw product records (caller maps to catalog).
 */
export async function* fetchOffIsraelProductPages(
  opts?: FetchOffIsraelPagesOpts,
): AsyncGenerator<Record<string, unknown>[], void, void> {
  const pageSize = Math.max(20, Math.min(100, opts?.pageSize ?? 100));
  const maxPages = Math.max(1, Math.min(500, opts?.maxPages ?? 300));
  const delayMs = Math.max(0, opts?.delayMs ?? 350);
  let totalSeen = 0;

  for (let page = 1; page <= maxPages; page++) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let products: Record<string, unknown>[] | null = null;

    for (const origin of OFF_API_ORIGINS) {
      const url = new URL(`${origin}/cgi/search.pl`);
      url.searchParams.set("action", "process");
      url.searchParams.set("json", "1");
      url.searchParams.set("tagtype_0", "countries");
      url.searchParams.set("tag_contains_0", "contains");
      url.searchParams.set("tag_0", "Israel");
      url.searchParams.set("page_size", String(pageSize));
      url.searchParams.set("page", String(page));

      let res: Response;
      try {
        res = await fetch(url.toString(), {
          signal: opts?.signal,
          headers: OFF_REQUEST_HEADERS,
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") throw e;
        continue;
      }

      if (!res.ok) continue;

      let text: string;
      try {
        text = await res.text();
      } catch {
        continue;
      }

      if (text.trimStart().startsWith("<")) continue;

      let json: unknown;
      try {
        json = JSON.parse(text);
      } catch {
        continue;
      }

      const raw = (json as { products?: unknown }).products;
      if (!Array.isArray(raw)) continue;

      const batch: Record<string, unknown>[] = [];
      for (const row of raw) {
        if (typeof row !== "object" || row === null) continue;
        const p = row as Record<string, unknown>;
        const code = normalizeBarcode(String(p.code ?? ""));
        if (code.length < 8) continue;
        const parsed = parseOffProductRecord(p);
        if (!offProductHasNutrition(parsed)) continue;
        batch.push(p);
      }

      products = batch;
      break;
    }

    if (!products) {
      if (page === 1) {
        throw new Error("לא הצלחנו להביא מוצרים מ-Open Food Facts (רשת או חסימה).");
      }
      return;
    }

    totalSeen += products.length;
    opts?.onPage?.({ page, productsOnPage: products.length, totalSeen });

    if (products.length === 0) return;
    yield products;

    if (products.length < pageSize) return;
    if (page < maxPages && delayMs > 0) await sleep(delayMs, opts?.signal);
  }
}
