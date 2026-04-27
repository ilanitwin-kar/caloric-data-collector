export function parseNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : NaN;
}

export function fmt1(n: number): string {
  if (!Number.isFinite(n)) return "—";
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}
