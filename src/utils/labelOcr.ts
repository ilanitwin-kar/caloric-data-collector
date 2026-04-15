/** Parsed per-100g macros from OCR text (best-effort; labels vary by manufacturer). */
export type ParsedMacros = {
  cals100?: number;
  prot100?: number;
  carb100?: number;
  sugars100?: number;
  fat100?: number;
  satFat100?: number;
  fiber100?: number;
  sodiumMg100?: number;
};

function stripBidi(s: string): string {
  return s.replace(/[\u200e\u200f\u202a-\u202e]/g, "");
}

function parseFloatLoose(s: string): number | undefined {
  const m = s.match(/-?\d+[.,]?\d*/);
  if (!m) return undefined;
  const v = parseFloat(m[0].replace(",", "."));
  if (!Number.isFinite(v)) return undefined;
  return v;
}

/**
 * Finds numbers on the same line as a keyword and returns the value closest to the keyword
 * (helps when RTL/LTR mix splits tokens).
 */
function numberClosestToKeyword(
  line: string,
  keywordRe: RegExp,
  minValue: number,
  maxValue: number,
): number | undefined {
  const match = line.match(keywordRe);
  if (!match || match.index === undefined) return undefined;
  const kwStart = match.index;
  const kwEnd = match.index + match[0].length;
  const reNum = /\d+[.,]?\d*/g;
  let best: { v: number; dist: number } | undefined;
  let m: RegExpExecArray | null;
  while ((m = reNum.exec(line)) !== null) {
    const v = parseFloat(m[0].replace(",", "."));
    if (!Number.isFinite(v) || v < minValue || v > maxValue) continue;
    const mid = m.index + m[0].length / 2;
    const dist = Math.min(Math.abs(mid - kwStart), Math.abs(mid - kwEnd));
    if (!best || dist < best.dist) best = { v, dist };
  }
  return best?.v;
}

/** אנרגיה — מעדיף קק"ל; אם רק kJ — המרה גסה לקק"ל */
function extractEnergyKcalFromLines(lines: string[]): number | undefined {
  const flat = lines.join("\n");

  const parenKcal = flat.match(/\(\s*(\d+[.,]?\d*)\s*קק/i);
  if (parenKcal?.[1]) {
    const v = parseFloatLoose(parenKcal[1]);
    if (v !== undefined && v > 10 && v < 5000) return v;
  }

  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/אנרגיה/i.test(line)) continue;

    const kcalAfter = line.match(/(\d+[.,]?\d*)\s*(?:קק|kcal)/i);
    if (kcalAfter?.[1]) {
      const v = parseFloatLoose(kcalAfter[1]);
      if (v !== undefined && v > 10 && v < 5000) return v;
    }
    const kcalBefore = line.match(/(?:קק["״']?\s*ל|kcal)[^\d]{0,14}(\d+[.,]?\d*)/i);
    if (kcalBefore?.[1]) {
      const v = parseFloatLoose(kcalBefore[1]);
      if (v !== undefined && v > 10 && v < 5000) return v;
    }

    const kjMatch =
      line.match(/(\d+[.,]?\d*)\s*(?:קילוג|קילו\s*ג|kJ)/i) ??
      line.match(/(\d+[.,]?\d*)\s*ק״?ג/i);
    if (kjMatch?.[1]) {
      const kj = parseFloatLoose(kjMatch[1]);
      if (kj !== undefined && kj > 200) return Math.round(kj / 4.184);
    }

    const closest = numberClosestToKeyword(line, /אנרגיה/, 30, 5000);
    if (closest !== undefined && closest > 10 && closest < 5000) return closest;
  }

  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/קלוריות/i.test(line)) continue;
    const n = numberClosestToKeyword(line, /קלוריות/, 10, 5000);
    if (n !== undefined) return n;
  }

  const joined = flat.replace(/\s+/g, " ");
  const globalKcal =
    joined.match(/(\d+[.,]?\d*)\s*(?:קק["״']?ל|kcal)\b/i) ??
    joined.match(/\b(?:קק["״']?ל|kcal)\s*[:\-]?\s*(\d+[.,]?\d*)/i);
  if (globalKcal?.[1]) {
    const v = parseFloatLoose(globalKcal[1]);
    if (v !== undefined && v > 10 && v < 5000) return v;
  }

  return undefined;
}

function extractProteinFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/חלבון/i.test(line) && !/\bprotein\b/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /חלבון|protein/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function extractCarbsFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/פחמימות|פחמימה/i.test(line) && !/\bcarb/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /פחמימות|פחמימה|carbohydrate|\bcarbs?\b/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function extractSugarsFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/סוכרים/i.test(line) && !/\bsugars?\b/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /סוכרים|sugars?/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function firstSmallNumberOnLine(line: string, max: number): number | undefined {
  const matches = line.match(/\d+[.,]?\d*/g);
  if (!matches) return undefined;
  for (const m of matches) {
    const v = parseFloat(m.replace(",", "."));
    if (Number.isFinite(v) && v >= 0 && v <= max) return v;
  }
  return undefined;
}

function extractFatFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/שומן/i.test(line) && !/\bfat\b/i.test(line)) continue;
    if (/\btrans\b|רווי|saturat|מומס/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /שומן|\bfat\b/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function extractSatFatFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/רווי|רווים/i.test(line) && !/saturat/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /רווי(?:ם)?|saturat/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function extractFiberFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/סיבים/i.test(line) && !/\bfiber\b/i.test(line)) continue;
    const n =
      numberClosestToKeyword(line, /סיבים|fiber/i, 0, 100) ??
      firstSmallNumberOnLine(line, 100);
    if (n !== undefined && n <= 100) return n;
  }
  return undefined;
}

function extractSodiumMgFromLines(lines: string[]): number | undefined {
  for (const raw of lines) {
    const line = stripBidi(raw);
    if (!/נתרן/i.test(line) && !/\bsodium\b/i.test(line)) continue;
    // Often sodium appears as mg.
    const n =
      numberClosestToKeyword(line, /נתרן|sodium/i, 0, 50000) ??
      firstSmallNumberOnLine(line, 50000);
    if (n !== undefined) return n;
  }
  return undefined;
}

export function parseNutritionFromOcrText(raw: string): ParsedMacros {
  const lines = raw.split(/\r?\n/).map((l) => stripBidi(l).trim());

  const out: ParsedMacros = {};

  const cal = extractEnergyKcalFromLines(lines);
  if (cal !== undefined) out.cals100 = cal;

  const p = extractProteinFromLines(lines);
  if (p !== undefined) out.prot100 = p;

  const c = extractCarbsFromLines(lines);
  if (c !== undefined) out.carb100 = c;

  const sug = extractSugarsFromLines(lines);
  if (sug !== undefined) out.sugars100 = sug;

  const f = extractFatFromLines(lines);
  if (f !== undefined) out.fat100 = f;

  const sat = extractSatFatFromLines(lines);
  if (sat !== undefined) out.satFat100 = sat;

  const fib = extractFiberFromLines(lines);
  if (fib !== undefined) out.fiber100 = fib;

  const sod = extractSodiumMgFromLines(lines);
  if (sod !== undefined) out.sodiumMg100 = sod;

  return out;
}

export function countParsedFields(m: ParsedMacros): number {
  let n = 0;
  if (m.cals100 !== undefined) n += 1;
  if (m.prot100 !== undefined) n += 1;
  if (m.carb100 !== undefined) n += 1;
  if (m.sugars100 !== undefined) n += 1;
  if (m.fat100 !== undefined) n += 1;
  if (m.satFat100 !== undefined) n += 1;
  if (m.fiber100 !== undefined) n += 1;
  if (m.sodiumMg100 !== undefined) n += 1;
  return n;
}

export async function runLabelOcr(image: Blob): Promise<string> {
  const { createWorker } = await import("tesseract.js");
  const worker = await createWorker("heb+eng", 1, {
    logger: () => {},
  });
  try {
    const {
      data: { text },
    } = await worker.recognize(image);
    return text ?? "";
  } finally {
    await worker.terminate();
  }
}
