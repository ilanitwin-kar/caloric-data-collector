import {
  OFF_REQUEST_HEADERS,
  normalizeBarcode,
  offProductHasNutrition,
  parseOffProductRecord,
} from "./openFoodFacts";

/** Israel-tagged search: prefer regional mirror, then world API. */
export const OFF_ISRAEL_API_ORIGINS = [
  "https://il.openfoodfacts.org",
  "https://world.openfoodfacts.org",
  "https://ssl-api.openfoodfacts.org",
] as const;

const PAGE_FETCH_ATTEMPTS = 4;
const RETRY_BASE_MS = 2500;

export type OffIsraelPageProgress = {
  page: number;
  productsOnPage: number;
  totalSeen: number;
};

export type OffIsraelFetchStopReason = "complete" | "rate_limited" | "empty" | "incomplete";

export type FetchOffIsraelPagesOpts = {
  pageSize?: number;
  maxPages?: number;
  startPage?: number;
  totalReportedCount?: number;
  delayMs?: number;
  signal?: AbortSignal;
  onPage?: (p: OffIsraelPageProgress) => void;
};

export type OffIsraelFetchSummary = {
  stopReason: OffIsraelFetchStopReason;
  lastPageFetched: number;
  /** Page that failed to load (retry this page on resume). */
  failedAtPage?: number;
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

function buildIsraelSearchUrl(origin: string, page: number, pageSize: number): string {
  const url = new URL(`${origin}/cgi/search.pl`);
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("tagtype_0", "countries");
  url.searchParams.set("tag_contains_0", "contains");
  url.searchParams.set("tag_0", "Israel");
  url.searchParams.set("page_size", String(pageSize));
  url.searchParams.set("page", String(page));
  return url.toString();
}

async function fetchIsraelPageOnce(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<{
  batch: Record<string, unknown>[];
  rawPageCount: number;
  totalReportedCount?: number;
} | null> {
  for (const origin of OFF_ISRAEL_API_ORIGINS) {
    let res: Response;
    try {
      res = await fetch(buildIsraelSearchUrl(origin, page, pageSize), {
        signal,
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

    return {
      batch,
      rawPageCount: raw.length,
      totalReportedCount:
        typeof payload.count === "number" && payload.count > 0 ? payload.count : undefined,
    };
  }
  return null;
}

async function fetchIsraelPageWithRetry(
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<{
  batch: Record<string, unknown>[];
  rawPageCount: number;
  totalReportedCount?: number;
} | null> {
  for (let attempt = 0; attempt < PAGE_FETCH_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(RETRY_BASE_MS * attempt, signal);
    const got = await fetchIsraelPageOnce(page, pageSize, signal);
    if (got) return got;
  }
  return null;
}

export function offIsraelResumePageFromSummary(summary: OffIsraelFetchSummary): number {
  if (summary.failedAtPage != null && summary.failedAtPage > 0) {
    return summary.failedAtPage;
  }
  return summary.lastPageFetched + 1;
}

export async function fetchOffIsraelReportedCount(signal?: AbortSignal): Promise<number | undefined> {
  const got = await fetchIsraelPageOnce(1, 1, signal);
  return got?.totalReportedCount;
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
      opts?.maxPages ?? (expectedLastPage != null ? expectedLastPage + 2 : 300),
    ),
  );
  const delayMs = Math.max(0, opts?.delayMs ?? 6500);
  let totalSeen = 0;
  let lastPageFetched = startPage - 1;

  for (let page = startPage; page <= maxPages; page++) {
    if (opts?.signal?.aborted) throw new DOMException("Aborted", "AbortError");

    const got = await fetchIsraelPageWithRetry(page, pageSize, opts?.signal);

    if (!got) {
      if (page === startPage) {
        throw new Error(
          `לא הצלחנו להביא עמוד ${page} מ-Open Food Facts (503/חסימה). נסי שוב בעוד דקה או «המשך ייבוא».`,
        );
      }
      return {
        stopReason: "rate_limited",
        lastPageFetched,
        failedAtPage: page,
        totalReportedCount,
      };
    }

    if (got.totalReportedCount != null && got.totalReportedCount > 0) {
      totalReportedCount = got.totalReportedCount;
    }

    const { batch, rawPageCount } = got;
    lastPageFetched = page;
    totalSeen += batch.length;
    opts?.onPage?.({ page, productsOnPage: batch.length, totalSeen });

    if (batch.length === 0 && rawPageCount === 0) {
      return { stopReason: "empty", lastPageFetched, totalReportedCount };
    }
    if (batch.length > 0) yield batch;

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
