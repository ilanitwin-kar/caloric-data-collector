export type {
  VerifiedSuggestionPick,
  VerifiedSuggestionSource,
} from "./verifiedSuggestionTypes";
export { verifiedPortionHintFromPick as verifiedPortionHint } from "./verifiedSuggestionTypes";

import {
  verifiedPortionHintFromPick,
  type VerifiedSuggestionPick,
} from "./verifiedSuggestionTypes";

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
          <span className="text-sm font-normal text-emerald-100/70 group-open:rotate-180 transition">
            ▼
          </span>
        </span>
      </summary>
      <div className="border-t border-emerald-400/20 px-3 pb-3 pt-2 space-y-2">
        {verifiedPicked ? (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
            <span className="text-[14px] font-semibold text-emerald-50">
              ✓ נבחרה התאמה מהמאגר המאומת
            </span>
            {!isAlreadyInCatalog ? (
              <button
                type="button"
                className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[14px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                onClick={onClearPicked}
              >
                הצג עוד הצעות
              </button>
            ) : null}
          </div>
        ) : null}

        {!verifiedPicked && visibleSuggestions.length > 0 ? (
          <>
            <p className="text-[14px] text-emerald-100/90">
              למילוי שם, תזונה ל־100g ומידות (יחידה/כף/כוס) — בחרי הצעה:
            </p>
            <div className="space-y-2">
              {visibleSuggestions.map((sug, idx) => {
                const portionHint = verifiedPortionHintFromPick(sug);
                return (
                  <div
                    key={`${sug.name}|${sug.brand ?? ""}|${verifiedOffset + idx}`}
                    className="flex flex-wrap items-center gap-2"
                  >
                    <button
                      type="button"
                      className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-sm font-semibold text-emerald-50 hover:bg-emerald-400/20"
                      onClick={() => onPick(sug)}
                    >
                      ✓ בחר
                    </button>
                    <span className="text-[14px] text-emerald-100/90">
                      {sug.source === "ministry" ? "משרד הבריאות · " : ""}
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
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-sm font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                  onClick={onMore}
                >
                  לא מתאים — עוד הצעות
                </button>
              ) : (
                <button
                  type="button"
                  className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-sm font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                  onClick={onDismiss}
                >
                  התעלם
                </button>
              )}
            </div>
            <p className="text-[14px] text-ink-dim">שם כללי עלול להתאים למוצר אחר — עדיף לבחור ידנית.</p>
          </>
        ) : !verifiedPicked ? (
          <p className="text-[14px] text-ink-dim leading-relaxed">
            אין הצעות כרגע — מלאי שם/מותג (או סרקי ברקוד) כדי לחפש במאגר המאומת.
          </p>
        ) : null}
      </div>
    </details>
  );
}
