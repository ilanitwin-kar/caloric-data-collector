/** Strip trailing voice commands from utterance text. */
export function cleanVoiceUtterance(raw: string): string {
  let t = raw.trim();
  t = t.replace(/\s*(הבא|סיום|דלג)\s*$/gi, "").trim();
  t = t.replace(/^(הבא|סיום|דלג)\s+/gi, "").trim();
  return t;
}

export function voiceSaysAdvance(text: string): boolean {
  const t = text.trim();
  return /\b(הבא|סיום)\b/i.test(t) || /^(הבא|סיום)$/i.test(t);
}

export function voiceSaysSkip(text: string): boolean {
  const t = text.trim();
  return t === "דלג" || /\bדלג\b/i.test(t);
}

/** First number in speech (digits), for macro / weight fields. */
export function extractSpokenNumber(raw: string): string {
  const cleaned = cleanVoiceUtterance(raw).replace(/,/g, ".");
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (m) return m[1];
  return cleaned;
}

export function normalizeKeywordsSpeech(raw: string): string {
  const t = cleanVoiceUtterance(raw);
  if (!t) return "";
  if (t.includes(",")) return t;
  return t
    .split(/\s+(?:ו|וגם|פסיק)\s+|\s+/g)
    .map((x) => x.trim())
    .filter(Boolean)
    .join(", ");
}
