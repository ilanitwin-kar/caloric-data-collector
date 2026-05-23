import { useEffect, useMemo, useState } from "react";
import { ministryKindLabel } from "../utils/ministryNutrition";
import { useVerified100 } from "../context/Verified100Context";
import { verifiedRowToPickPortions } from "../utils/verifiedMeasures";
import { verifiedSearchQueryReady } from "../utils/verifiedSearch";
import { formatPer100gLine } from "../utils/nutritionDisplay";
import {
  verifiedItemToSuggestionPick,
  verifiedPortionHintFromPick,
  type VerifiedSuggestionPick,
} from "./verifiedSuggestionTypes";

function formatG(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return `${Math.round(v * 10) / 10} g`;
}

function nutritionPreview(sug: VerifiedSuggestionPick): string | null {
  const line = formatPer100gLine({
    calories: sug.calories100,
    proteinG: sug.protein100,
    carbsG: sug.carbs100,
    fatG: sug.fat100,
  });
  return line === "—" ? null : `${line}/100g`;
}

function RecipeRow({
  sug,
  onApplyNamePortions,
  onApplyWithNutrition,
  onOpenEdit,
}: {
  sug: VerifiedSuggestionPick;
  onApplyNamePortions?: (sug: VerifiedSuggestionPick) => void;
  onApplyWithNutrition?: (sug: VerifiedSuggestionPick) => void;
  onOpenEdit?: (sug: VerifiedSuggestionPick) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const portionHint = verifiedPortionHintFromPick(sug);
  const nutrition = nutritionPreview(sug);

  return (
    <div className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] overflow-hidden">
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 text-start"
          aria-expanded={expanded}
        >
          <span className="rounded-md border border-amber-400/35 bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">
            {ministryKindLabel("recipe")}
          </span>
          <p className="mt-1 text-[11px] font-medium text-white">{sug.name}</p>
          <p className="text-[10px] text-ink-muted">
            {portionHint ?? "ללא מידות"}
            {nutrition ? ` · ${nutrition}` : ""}
            {sug.matchScore != null ? ` · ציון ${sug.matchScore}` : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
        >
          {expanded ? "סגור" : "פרטים"}
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-2">
          <p className="text-[10px] text-ink-dim leading-relaxed">
            מתכון מורכב ממשרד הבריאות — לא מוצר מסחרי. ערכי את השדות למטה ובחרי מה להכניס למאגר.
            תזונה MoH מוצגת לעיון; ברירת מחדל: מילוי שם + מידות בלבד.
          </p>
          {sug.portionLines?.length ? (
            <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
              <table className="w-full text-[11px]">
                <tbody>
                  {sug.portionLines.map((line) => (
                    <tr
                      key={line.midaCode}
                      className="border-b border-white/5 last:border-0"
                    >
                      <td className="w-[42%] px-2 py-1.5 text-ink-dim">{line.label}</td>
                      <td className="px-2 py-1.5 font-medium text-white tabular-nums">
                        {formatG(line.grams)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-[11px] text-ink-dim">אין שורות מידה לפריט זה</p>
          )}
          <div className="flex flex-col gap-2">
            {onApplyNamePortions ? (
              <button
                type="button"
                className="min-h-[40px] w-full rounded-xl border border-amber-400/40 bg-amber-500/20 px-3 py-2 text-xs font-semibold text-amber-50 hover:bg-amber-500/30"
                onClick={() => onApplyNamePortions(sug)}
              >
                החל שם + מידות לטופס
              </button>
            ) : null}
            {onApplyWithNutrition ? (
              <button
                type="button"
                className="min-h-[40px] w-full rounded-xl bg-amber-400/90 px-3 py-2 text-xs font-semibold text-black hover:bg-amber-300"
                onClick={() => onApplyWithNutrition(sug)}
              >
                החל שם + מידות + תזונה MoH
              </button>
            ) : null}
            {onOpenEdit ? (
              <button
                type="button"
                className="min-h-[40px] w-full rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
                onClick={() => onOpenEdit(sug)}
              >
                ערוך בטופס מלא
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type MinistryRecipesPanelProps = {
  searchQuery?: string;
  defaultSearch?: string;
  limit?: number;
  onApplyNamePortions?: (sug: VerifiedSuggestionPick) => void;
  onApplyWithNutrition?: (sug: VerifiedSuggestionPick) => void;
  onOpenEdit?: (sug: VerifiedSuggestionPick) => void;
};

export function MinistryRecipesPanel({
  searchQuery: controlledQuery,
  defaultSearch = "",
  limit = 12,
  onApplyNamePortions,
  onApplyWithNutrition,
  onOpenEdit,
}: MinistryRecipesPanelProps) {
  const { findScoredMatches } = useVerified100();
  const [localQuery, setLocalQuery] = useState(defaultSearch);
  const searchQuery = controlledQuery ?? localQuery;

  useEffect(() => {
    if (defaultSearch) setLocalQuery(defaultSearch);
  }, [defaultSearch]);

  const suggestions = useMemo(() => {
    if (!verifiedSearchQueryReady(searchQuery)) return [];
    const scored = findScoredMatches(
      { name: searchQuery.trim() },
      { limit, source: "ministry", kindsOnly: ["recipe"] },
    );
    return scored.map(({ item, score }) =>
      verifiedItemToSuggestionPick(item, score, verifiedRowToPickPortions(item)),
    );
  }, [findScoredMatches, limit, searchQuery]);

  const canSearch = verifiedSearchQueryReady(searchQuery);

  return (
    <div className="space-y-3 rounded-2xl border border-amber-400/25 bg-amber-500/[0.05] p-4">
      <div>
        <p className="text-sm font-semibold text-amber-50">מתכונים משרד הבריאות</p>
        <p className="mt-1 text-[11px] leading-relaxed text-ink-dim">
          רק במסך בדיקת OFF — לא מופיעים בהצעות חיפוש רגילות. בחרי מתכון, ערכי בטופס, והחליטי אם
          להוסיף למאגר.
        </p>
      </div>

      {controlledQuery == null ? (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">חיפוש מתכון</span>
          <input
            type="search"
            value={localQuery}
            onChange={(e) => setLocalQuery(e.target.value)}
            placeholder="למשל בורגול, סלט, מרק"
            className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none"
          />
        </label>
      ) : null}

      {!canSearch ? (
        <p className="text-[11px] text-ink-dim">הזיני לפחות 3 תווים לחיפוש מתכונים.</p>
      ) : suggestions.length === 0 ? (
        <p className="text-[11px] text-ink-dim">
          לא נמצאו מתכונים — נסי מילה אחרת או «סנכרן משרד הבריאות» בהגדרות.
        </p>
      ) : (
        <div className="space-y-2">
          <p className="text-[10px] text-ink-dim">
            {suggestions.length} מתכונים{searchQuery.trim() ? ` · «${searchQuery.trim()}»` : ""}
          </p>
          {suggestions.map((sug, i) => (
            <RecipeRow
              key={`recipe|${sug.ministryCode ?? sug.name}|${i}`}
              sug={sug}
              onApplyNamePortions={onApplyNamePortions}
              onApplyWithNutrition={onApplyWithNutrition}
              onOpenEdit={onOpenEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}
