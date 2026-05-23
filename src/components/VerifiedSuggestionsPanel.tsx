import { useState } from "react";
import type { CatalogNutritionPer100g } from "../context/CatalogContext";
import { verifiedSearchQueryReady } from "../utils/verifiedSearch";
import type { VerifiedSuggestionPick } from "./verifiedSuggestionTypes";

function formatMacro(v: number | undefined, suffix = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v}${suffix}`;
}

function NutritionPreviewTable({ per }: { per?: CatalogNutritionPer100g }) {
  const rows: Array<{ label: string; value: string }> = [
    { label: "קלוריות", value: formatMacro(per?.calories, " קק״ל") },
    { label: "חלבון", value: formatMacro(per?.proteinG, " g") },
    { label: "שומן", value: formatMacro(per?.fatG, " g") },
    { label: "פחמימות", value: formatMacro(per?.carbsG, " g") },
  ];
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-white/5 last:border-0">
              <td className="w-[38%] px-2 py-1.5 text-ink-dim">{r.label}</td>
              <td className="px-2 py-1.5 font-medium text-white tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TsvSuggestionRow({
  sug,
  onPickNutrition,
  onPickFull,
}: {
  sug: VerifiedSuggestionPick;
  onPickNutrition: (sug: VerifiedSuggestionPick) => void;
  onPickFull: (sug: VerifiedSuggestionPick) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  const per: CatalogNutritionPer100g = {
    calories: sug.calories100,
    proteinG: sug.protein100,
    carbsG: sug.carbs100,
    fatG: sug.fat100,
  };

  return (
    <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/[0.06] overflow-hidden">
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 text-start"
          aria-expanded={expanded}
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded-md border border-emerald-400/35 bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-emerald-100">
              מאגר מאומת
            </span>
            {sug.matchScore != null ? (
              <span className="text-[9px] text-ink-dim">ציון {sug.matchScore}</span>
            ) : null}
          </div>
          <p className="mt-1 text-[11px] font-medium text-white">{sug.name}</p>
          <p className="text-[10px] text-ink-muted">
            {sug.brand ? `${sug.brand} · ` : ""}
            {sug.category ? `${sug.category} · ` : ""}
            {sug.calories100 != null ? `${sug.calories100} קק״ל/100g` : "ללא קלוריות בפריט"}
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
            ממלא תזונה ל־100g בלבד. אריזה ומידות — בהמשך, ממשרד הבריאות.
          </p>
          <NutritionPreviewTable per={per} />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="min-h-[40px] flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black"
              onClick={() => onPickNutrition(sug)}
            >
              מלא תזונה
            </button>
            <button
              type="button"
              className="min-h-[40px] rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
              onClick={() => onPickFull(sug)}
            >
              החלף גם שם/מותג
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 pb-2 pt-1">
          <button
            type="button"
            className="rounded-lg bg-white/10 px-2 py-1 text-[10px] font-semibold text-white hover:bg-white/15"
            onClick={() => onPickNutrition(sug)}
          >
            מלא תזונה
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
            onClick={() => onPickFull(sug)}
          >
            + שם/מותג
          </button>
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
            onClick={() => setExpanded(true)}
          >
            פרטים
          </button>
        </div>
      )}
    </div>
  );
}

type VerifiedSuggestionsPanelProps = {
  suggestions: VerifiedSuggestionPick[];
  verifiedPicked: boolean;
  isAlreadyInCatalog: boolean;
  searchQuery: string;
  onPickNutrition: (sug: VerifiedSuggestionPick) => void;
  onPickFull: (sug: VerifiedSuggestionPick) => void;
  onClearPicked: () => void;
  onDismiss: () => void;
};

export function VerifiedSuggestionsPanel({
  suggestions,
  verifiedPicked,
  isAlreadyInCatalog,
  searchQuery,
  onPickNutrition,
  onPickFull,
  onClearPicked,
  onDismiss,
}: VerifiedSuggestionsPanelProps) {
  const hasAny = suggestions.length > 0;

  if (!verifiedSearchQueryReady(searchQuery) && !verifiedPicked) {
    return (
      <p className="rounded-xl border border-emerald-400/20 bg-emerald-500/[0.04] px-3 py-2 text-[11px] text-ink-dim">
        מאגר מאומת — הזיני לפחות 3 תווים בשם, שם קצר או מילות חיפוש.
      </p>
    );
  }

  return (
    <div className="space-y-3 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-emerald-50">מאגר מאומת — תזונה ל־100g</p>
          <p className="mt-0.5 text-[10px] text-ink-dim">
            חיפוש: «{searchQuery}»
            {hasAny ? ` · ${suggestions.length} התאמות` : " · אין התאמות"}
          </p>
        </div>
        {hasAny && !verifiedPicked ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
          >
            התעלם
          </button>
        ) : null}
      </div>

      {verifiedPicked ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
          <span className="text-[11px] font-semibold text-emerald-50">✓ נבחרה תזונה מהמאגר המאומת</span>
          {!isAlreadyInCatalog ? (
            <button
              type="button"
              className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
              onClick={onClearPicked}
            >
              הצג שוב
            </button>
          ) : null}
        </div>
      ) : null}

      {!verifiedPicked && hasAny ? (
        <div className="space-y-2">
          {suggestions.map((sug, i) => (
            <TsvSuggestionRow
              key={`tsv|${sug.verifiedId ?? sug.name}|${i}`}
              sug={sug}
              onPickNutrition={onPickNutrition}
              onPickFull={onPickFull}
            />
          ))}
        </div>
      ) : null}

      {!verifiedPicked && !hasAny && verifiedSearchQueryReady(searchQuery) ? (
        <p className="text-[11px] text-ink-dim">
          לא נמצאו התאמות — מלאי תזונה ידנית למטה, או ייבאי/עדכני את קובץ המאגר בהגדרות.
        </p>
      ) : null}
    </div>
  );
}
