/** Build search text from all product identity fields on Home / quick-fill. */
export function buildVerifiedSearchQuery(parts: {
  name?: string;
  shortName?: string;
  keywordsRaw?: string;
  category?: string;
}): string {
  const keywords = (parts.keywordsRaw ?? "").replace(/[,]+/g, " ").trim();
  return [parts.name, parts.shortName, keywords, parts.category]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .trim();
}

export function verifiedSearchQueryReady(query: string): boolean {
  return query.replace(/\s+/g, "").length >= 3;
}
