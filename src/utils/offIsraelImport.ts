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

export type OffIsraelFetchStopReason = "complete" | "rate_limited" | "empty" | "incomplete";

export type FetchOffIsraelPagesOpts = {
  pageSize?: number;
  maxPages?: number;
  /** First page to fetch (1-based). Used to resume after rate limits. */
  startPage?: number;
  /** Total products reported by OFF search (from count field). */
  totalReportedCount?: number;
  delayMs?: number;
  signal?: AbortSignal;
  onPage?: (p: OffIsraelPageProgress) => void;
};

export type OffIsraelFetchSummary = {
  stopReason: OffIsraelFetchStopReason;
  lastPageFetched: number;
  totalReportedCount?: number;
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
export async function fetchOffIsraelReportedCount(signal?: AbortSignal): Promise<number | undefined> {
  for (const origin of OFF_API_ORIGINS) {
    const url = new URL(`${origin}/cgi/search.pl`);
    url.searchParams.set("action", "process");
    url.searchParams.set("json", "1");
    url.searchParams.set("tagtype_0", "countries");
    url.searchParams.set("tag_contains_0", "contains");
    url.searchParams.set("tag_0", "Israel");
    url.searchParams.set("page_size", "1");
    url.searchParams.set("page", "1");
    try {
      const res = await fetch(url.toString(), { signal, headers: OFF_REQUEST_HEADERS });
      if (!res.ok) continue;
      const json = (await res.json()) as { count?: number };
      if (typeof json.count === "number" && json.count > 0) return json.count;
    } catch {
      continue;
    }
  }
  return undefined;
}

export async function* fetchOffIsraelProductPages(
  opts?: FetchOffIsraelPagesOpts,
): AsyncGenerator<Record<string, unknown>[], OffIsraelFetchSummary, void> {
  const pageSize = Math.max(20, Math.min(100, opts?.pageSize ?? 100));
  const startPage = Math.max(1, opts?.startPage ?? 1);
  let totalReportedCount = opts?.totalReportedCount;
  const expectedLastPage =
    totalReportedCount != null && totalReportedCount > 0 ?
      Math.ceil(totalReportedCount / pageSize)
    : null;
  const maxPages = Math.max(
    startPage,
    Math.min(
      500,
      opts?.maxPages ??
        (expectedLastPage != null ? expectedLastPage + 2 : 300),
    ),
  );
  const delayMs = Math.max(0, opts?.delayMs ?? 6500);
  let totalSeen = 0;
  let lastPageFetched = startPage - 1;

  for (let page = startPage; page <= maxPages; page++) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    let products: Record<string, unknown>[] | null = null;
    let rawPageCount = 0;

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

      const payload = json as { products?: unknown; count?: number };
      if (typeof payload.count === "number" && payload.count > 0) {
        totalReportedCount = payload.count;
      }
      const raw = payload.products;
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
      rawPageCount = raw.length;
      break;
    }

    if (!products) {
      if (page === startPage) {
        throw new Error("לא הצלחנו להביא מוצרים מ-Open Food Facts (רשת או חסימה).");
      }
      return {
        stopReason: "rate_limited",
        lastPageFetched,
        totalReportedCount,
      };
    }

    lastPageFetched = page;
    totalSeen += products.length;
    opts?.onPage?.({ page, productsOnPage: products.length, totalSeen });

    if (products.length === 0 && rawPageCount === 0) {
      return { stopReason: "empty", lastPageFetched, totalReportedCount };
    }
    if (products.length > 0) yield products;

    if (rawPageCount < pageSize) {
      if (expectedLastPage != null && page < expectedLastPage) {
        return { stopReason: "incomplete", lastPageFetched, totalReportedCount };
      }
      return { stopReason: "complete", lastPageFetched, totalReportedCount };
    }
    if (page < maxPages && delayMs > 0) await sleep(delayMs, opts?.signal);
  }

  return { stopReason: "complete", lastPageFetched, totalReportedCount };
}
