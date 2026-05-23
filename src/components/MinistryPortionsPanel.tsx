import { useState } from "react";
import { verifiedSearchQueryReady } from "../utils/verifiedSearch";
import {
  verifiedPortionHintFromPick,
  type VerifiedSuggestionPick,
} from "./verifiedSuggestionTypes";

function formatG(v: number | undefined): string {
  if (v == null || !Number.isFinite(v) || v <= 0) return "—";
  return `${Math.round(v * 10) / 10} g`;
}

function PortionsPreviewTable({ sug }: { sug: VerifiedSuggestionPick }) {
  const rows: Array<{ label: string; value: string }> = [];
  if (sug.packWeightG != null && sug.packWeightG > 0) {
    rows.push({ label: "משקל אריזה", value: formatG(sug.packWeightG) });
  }
  if (sug.unitsPerPack != null && sug.unitsPerPack > 0) {
    rows.push({ label: "יחידות באריזה", value: String(sug.unitsPerPack) });
  }
  if (sug.unitWeightG != null && sug.unitWeightG > 0) {
    rows.push({ label: "משקל יחידה", value: formatG(sug.unitWeightG) });
  }
  const m = sug.measures;
  if (m?.cupsPer100g && m.cupsPer100g > 0) {
    rows.push({ label: "גרם בכוס", value: formatG(100 / m.cupsPer100g) });
  }
  if (m?.tbspPer100g && m.tbspPer100g > 0) {
    rows.push({ label: "גרם בכף", value: formatG(100 / m.tbspPer100g) });
  }
  if (m?.tspPer100g && m.tspPer100g > 0) {
    rows.push({ label: "גרם בכפית", value: formatG(100 / m.tspPer100g) });
  }
  if (rows.length === 0) {
    return <p className="text-[11px] text-ink-dim">אין נתוני אריזה/מידות לפריט זה</p>;
  }
  return (
    <div className="overflow-hidden rounded-lg border border-white/10 bg-black/25">
      <table className="w-full text-[11px]">
        <tbody>
          {rows.map((r) => (
            <tr key={r.label} className="border-b border-white/5 last:border-0">
              <td className="w-[42%] px-2 py-1.5 text-ink-dim">{r.label}</td>
              <td className="px-2 py-1.5 font-medium text-white tabular-nums">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MinistrySuggestionRow({
  sug,
  onApprove,
}: {
  sug: VerifiedSuggestionPick;
  onApprove: (sug: VerifiedSuggestionPick) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const portionHint = verifiedPortionHintFromPick(sug);

  return (
    <div className="rounded-xl border border-teal-400/25 bg-teal-500/[0.06] overflow-hidden">
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="min-w-0 flex-1 text-start"
          aria-expanded={expanded}
        >
          <span className="rounded-md border border-teal-400/35 bg-teal-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-teal-100">
            משרד הבריאות
          </span>
          <p className="mt-1 text-[11px] font-medium text-white">{sug.name}</p>
          <p className="text-[10px] text-ink-muted">
            {portionHint ? portionHint : "ללא מידות — פתחי לפרטים"}
            {sug.matchScore != null ? ` · ציון ${sug.matchScore}` : ""}
          </p>
        </button>
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
        >
          {expanded ? "סגור" : "בדיקה"}
        </button>
      </div>

      {expanded ? (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-2">
          <p className="text-[10px] text-ink-dim leading-relaxed">
            ודאי שזה המצרך הנכון. אישור ימלא <span className="text-white/90">רק אריזה ומידות</span> — לא
            ישנה קלוריות/מאקרו שכבר מולאו מהמאגר המאומת או ידנית.
          </p>
          <PortionsPreviewTable sug={sug} />
          <button
            type="button"
            className="min-h-[40px] w-full rounded-xl bg-teal-400/90 px-3 py-2 text-xs font-semibold text-black hover:bg-teal-300"
            onClick={() => onApprove(sug)}
          >
            אשר — מלא אריזה ומידות
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 pb-2 pt-1">
          <button
            type="button"
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
            onClick={() => setExpanded(true)}
          >
            בדיקה לפני אישור
          </button>
        </div>
      )}
    </div>
  );
}

type MinistryPortionsPanelProps = {
  suggestions: VerifiedSuggestionPick[];
  searchQuery: string;
  nutritionReady: boolean;
  pickedLabel: string | null;
  onApprove: (sug: VerifiedSuggestionPick) => void;
  onClearPicked: () => void;
  onDismiss: () => void;
};

export function MinistryPortionsPanel({
  suggestions,
  searchQuery,
  nutritionReady,
  pickedLabel,
  onApprove,
  onClearPicked,
  onDismiss,
}: MinistryPortionsPanelProps) {
  const hasAny = suggestions.length > 0;

  if (!nutritionReady) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-ink-dim">
        קודם מלאי תזונה ל־100g (מהמאגר המאומת או ידנית) — ואז יופיעו כאן הצעות אריזה/מידות ממשרד
        הבריאות.
      </p>
    );
  }

  if (!verifiedSearchQueryReady(searchQuery) && !pickedLabel) {
    return (
      <p className="rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[11px] text-ink-dim">
        הזיני לפחות 3 תווים בשם / שם קצר / מילות חיפוש כדי לחפש מצרכים במשרד הבריאות.
      </p>
    );
  }

  return (
    <div className="space-y-2 rounded-xl border border-teal-400/20 bg-teal-500/[0.04] p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <p className="text-xs font-semibold text-teal-100">הצעות משרד הבריאות — אריזה ומידות בלבד</p>
          <p className="mt-0.5 text-[10px] text-ink-dim">
            חיפוש: «{searchQuery}»
            {hasAny ? ` · ${suggestions.length} התאמות` : " · אין התאמות"}
          </p>
        </div>
        {hasAny && !pickedLabel ? (
          <button
            type="button"
            onClick={onDismiss}
            className="rounded-lg border border-white/15 px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
          >
            התעלם
          </button>
        ) : null}
      </div>

      {pickedLabel ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-teal-400/25 bg-teal-500/10 px-3 py-2">
          <span className="text-[11px] font-semibold text-teal-50">
            ✓ אריזה/מידות: {pickedLabel}
          </span>
          <button
            type="button"
            className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
            onClick={onClearPicked}
          >
            הצג שוב
          </button>
        </div>
      ) : null}

      {!pickedLabel && hasAny ? (
        <div className="space-y-2">
          {suggestions.map((sug, i) => (
            <MinistrySuggestionRow
              key={`moh|${sug.ministryCode ?? sug.name}|${i}`}
              sug={sug}
              onApprove={onApprove}
            />
          ))}
        </div>
      ) : null}

      {!pickedLabel && !hasAny && verifiedSearchQueryReady(searchQuery) ? (
        <p className="text-[11px] text-ink-dim">
          לא נמצאו מצרכים — נסי מילה גנéric יותר (למשל «גבינה צהובה») או «סנכרן משרד הבריאות» בהגדרות.
        </p>
      ) : null}
    </div>
  );
}
