const STORAGE_KEY = "ci_body_weight_kg";
export const BODY_WEIGHT_CHANGED = "ci-body-weight-updated";

export function readBodyWeightKg(): number | null {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (!s) return null;
    const n = parseFloat(s.replace(",", "."));
    if (!Number.isFinite(n) || n < 20 || n > 400) return null;
    return n;
  } catch {
    return null;
  }
}

export function writeBodyWeightKg(kg: number): void {
  if (!Number.isFinite(kg) || kg < 20 || kg > 400) return;
  localStorage.setItem(STORAGE_KEY, String(kg));
  window.dispatchEvent(new Event(BODY_WEIGHT_CHANGED));
}

export function clearBodyWeightKg(): void {
  localStorage.removeItem(STORAGE_KEY);
  window.dispatchEvent(new Event(BODY_WEIGHT_CHANGED));
}
