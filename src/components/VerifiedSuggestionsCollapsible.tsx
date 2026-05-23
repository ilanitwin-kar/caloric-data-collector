export type VerifiedSuggestionPick = {
  name: string;
  brand?: string;
  category?: string;
  calories100?: number;
  protein100?: number;
  carbs100?: number;
  fat100?: number;
  unitWeightG?: number;
  packWeightG?: number;
  unitsPerPack?: number;
  measures?: {
    unitsPer100g?: number;
    tbspPer100g?: number;
    tspPer100g?: number;
    cupsPer100g?: number;
  };
  commonMeasures?: ("unit" | "tbsp" | "tsp" | "cup" | "g100")[];
  defaultMeasure?: "unit" | "tbsp" | "tsp" | "cup" | "g100";
};

function verifiedPortionHint(sug: VerifiedSuggestionPick): string | null {
  const parts: string[] = [];
  if (sug.unitWeightG != null && sug.unitWeightG > 0) {
    parts.push(`יחידה ~${Math.round(sug.unitWeightG)}g`);
  }
  if (sug.measures?.tbspPer100g && sug.measures.tbspPer100g > 0) parts.push("כף");
  if (sug.measures?.cupsPer100g && sug.measures.cupsPer100g > 0) parts.push("כוס");
  return parts.length > 0 ? parts.join(" · ") : null;
}

type VerifiedSuggestionsCollapsibleProps = {
  suggestions: VerifiedSuggestionPick[];
  visibleSuggestions: VerifiedSuggestionPick[];
  verifiedOffset: number;
  verifiedPicked: boolean;
  isAlreadyInCatalog: boolean;
  onPick: (sug: VerifiedSuggestionPick) => void;
  onMore: () => void;
  onDismiss: () => void;
  onClearPicked: () => void;
  defaultOpen?: boolean;
};

export function VerifiedSuggestionsCollapsible({
  suggestions,
  visibleSuggestions,
  verifiedOffset,
  verifiedPicked,
  isAlreadyInCatalog,
  onPick,
  onMore,
  onDismiss,
  onClearPicked,
  defaultOpen = false,
}: VerifiedSuggestionsCollapsibleProps) {
  const hasSuggestions = suggestions.length > 0;
  const summaryLabel = verifiedPicked
    ? "הצעות מהמאגר המאומת — נבחרה התאמה"
    : hasSuggestions
      ? `הצעות מהמאגר המאומת (${suggestions.length})`
      : "הצעות מהמאגר המאומת";

  return (
    <details
      className="group rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07]"
      open={defaultOpen && hasSuggestions && !verifiedPicked}
    >
      <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-emerald-50 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex items-center justify-between gap-2">
          <span>{summaryLabel}</span>
          <span className="text-[10px] font-normal text-emerald-100/70 group-open:rotate-180 transition">
            ▼
          </span>
        </span>
      </summary>
      <div className="border-t border-emerald-400/20 px-3 pb-3 pt-2 space-y-2">
        {verifiedPicked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
            <span className="text-[11px] font-semibold text-emerald-50">
              ✓ נבחרה התאמה מהמאגר המאומת
            </span>
            {!isAlreadyInCatalog ? (
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                onClick={onClearPicked}
              >
                הצג עוד הצעות
              </button>
            ) : null}
          </div>
        ) : null}

        {!verifiedPicked && visibleSuggestions.length > 0 ? (
          <>
            <p className="text-[11px] text-emerald-100/90">
              למילוי שם, תזונה ל־100g ומידות (יחידה/כף/כוס) — בחרי הצעה:
            </p>
            <div className="space-y-2">
              {visibleSuggestions.map((sug, idx) => {
                const portionHint = verifiedPortionHint(sug);
                return (
                <div
                  key={`${sug.name}|${sug.brand ?? ""}|${verifiedOffset + idx}`}
                  className="flex flex-wrap items-center gap-2"
                >
                  <button
                    type="button"
                    className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/20"
                    onClick={() => onPick(sug)}
                  >
                    ✓ בחר
                  </button>
                  <span className="text-[11px] text-emerald-100/90">
                    {sug.name}
                    {sug.brand ? ` · ${sug.brand}` : ""}
                    {sug.category ? ` · ${sug.category}` : ""}
                    {sug.calories100 != null ? ` · ${sug.calories100} קק״ל` : ""}
                    {portionHint ? ` · ${portionHint}` : ""}
                  </span>
                </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-2">
              {verifiedOffset + 4 < suggestions.length ? (
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                  onClick={onMore}
                >
                  לא מתאים — עוד הצעות
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                  onClick={onDismiss}
                >
                  התעלם
                </button>
              )}
            </div>
            <p className="text-[11px] text-ink-dim">שם כללי עלול להתאים למוצר אחר — עדיף לבחור ידנית.</p>
          </>
        ) : !verifiedPicked ? (
          <p className="text-[11px] text-ink-dim leading-relaxed">
            אין הצעות כרגע — מלאי שם/מותג (או סרקי ברקוד) כדי לחפש במאגר המאומת.
          </p>
        ) : null}
      </div>
    </details>
  );
}
