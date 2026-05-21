import type { OffImportCheckpoint } from "./offImportProgress";
import { offImportCheckpointIsResumable } from "./offImportProgress";

const KEY_PREFIX = "off-import-checkpoint:";

export function readLocalOffImportCheckpoint(
  uid: string,
  opts?: { allowNonResumable?: boolean },
): OffImportCheckpoint | null {
  try {
    const raw = localStorage.getItem(`${KEY_PREFIX}${uid}`);
    if (!raw) return null;
    const v = JSON.parse(raw) as OffImportCheckpoint;
    if (!opts?.allowNonResumable && !offImportCheckpointIsResumable(v)) return null;
    if (typeof v.nextPage !== "number" || v.nextPage < 1) return null;
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
    if (!checkpoint || !offImportCheckpointIsResumable(checkpoint)) {
      localStorage.removeItem(key);
      return;
    }
    localStorage.setItem(key, JSON.stringify(checkpoint));
  } catch {
    /* ignore quota */
  }
}
