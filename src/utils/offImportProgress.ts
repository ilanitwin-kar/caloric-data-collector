export type OffImportStopReason =
  | "rate_limited"
  | "paused"
  | "aborted"
  | "incomplete"
  | "complete";

export type OffImportCheckpoint = {
  nextPage: number;
  stopReason: OffImportStopReason;
  lastPageFetched?: number;
  totalOffReported?: number;
  updatedAt: string;
};

export const OFF_IMPORT_PAGE_SIZE = 100;

/** OFF rate-limits browsers — only a few pages per button click. */
export const OFF_IMPORT_PAGES_PER_RUN = 4;

export function offImportExpectedLastPage(
  totalReported?: number,
  pageSize = OFF_IMPORT_PAGE_SIZE,
): number | null {
  if (totalReported == null || totalReported <= 0) return null;
  return Math.ceil(totalReported / pageSize);
}

/** True only when the last OFF API page for this search was reached. */
export function offImportIsFullyComplete(
  lastPageFetched: number,
  totalReported?: number,
  pageSize = OFF_IMPORT_PAGE_SIZE,
): boolean {
  const expectedLast = offImportExpectedLastPage(totalReported, pageSize);
  if (expectedLast == null) return false;
  return lastPageFetched >= expectedLast;
}

export function offImportCheckpointIsResumable(ck: OffImportCheckpoint | null): boolean {
  if (!ck || ck.nextPage < 1) return false;
  if (offImportIsFullyComplete(ck.lastPageFetched ?? 0, ck.totalOffReported)) return false;
  return true;
}

export function offImportResumePage(ck: OffImportCheckpoint | null): number | null {
  if (!offImportCheckpointIsResumable(ck)) return null;
  return Math.max(1, ck!.nextPage);
}

/** Align stored checkpoint with fetch summary (retry failed page, not skip ahead). */
export function offImportNextPageFromSummary(
  summary: {
    lastPageFetched: number;
    failedAtPage?: number;
    stopReason: string;
  },
): number {
  if (summary.failedAtPage != null && summary.failedAtPage > 0) {
    return summary.failedAtPage;
  }
  return summary.lastPageFetched + 1;
}
