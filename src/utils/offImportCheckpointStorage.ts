import type { OffImportCheckpoint } from "../context/CatalogContext";

const KEY_PREFIX = "off-import-checkpoint:";

export function readLocalOffImportCheckpoint(uid: string): OffImportCheckpoint | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${uid}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as OffImportCheckpoint;
    if (typeof v.nextPage !== "number" || v.nextPage < 2) return null;
    return v;
  } catch {
    return null;
  }
}

export function writeLocalOffImportCheckpoint(
  uid: string,
  checkpoint: OffImportCheckpoint | null,
): void {
  const key = `${KEY_PREFIX}${uid}`;
  try {
    if (!checkpoint || checkpoint.nextPage < 2) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(checkpoint));
  } catch {
    /* ignore quota */
  }
}
