import type { CatalogNutritionPer100g, CatalogPer100Basis } from "../context/CatalogContext";
import type { OffPendingReview } from "../utils/offCatalog";
import type { OffVerifiedLinkMeta } from "../utils/offCatalog";
import { VERIFIED_AUTO_APPLY_MIN_SCORE } from "../utils/verifiedTsv";

function formatMacro(v: number | undefined, suffix = ""): string {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${v}${suffix}`;
}

function NutritionMacroTable({
  per,
  basis = "g",
}: {
  per?: CatalogNutritionPer100g;
  basis?: CatalogPer100Basis;
}) {
  const unitLabel = basis === "ml" ? "100 מ״ל" : "100 גרם";
  const rows: Array<{ label: string; value: string }> = [
    { label: "קלוריות", value: formatMacro(per?.calories, " קק״ל") },
    { label: "חלבון", value: formatMacro(per?.proteinG, " g") },
    { label: "שומן", value: formatMacro(per?.fatG, " g") },
    { label: "פחמימות", value: formatMacro(per?.carbsG, " g") },
  ];
  const hasAny = rows.some((r) => r.value !== "—");

  return (
    <div className="mt-2 overflow-hidden rounded-lg border border-white/10 bg-black/25">
      <p className="border-b border-white/10 bg-white/[0.04] px-2 py-1 text-sm font-medium text-ink-dim">
        תזונה ל־{unitLabel}
        {!hasAny ? " · אין נתונים" : ""}
      </p>
      <table className="w-full text-[14px]">
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

function SourceColumn({
  title,
  subtitle,
  name,
  brand,
  category,
  nutrition,
  basis,
  accent,
}: {
  title: string;
  subtitle: string;
  name: string;
  brand?: string;
  category?: string;
  nutrition?: CatalogNutritionPer100g;
  basis?: CatalogPer100Basis;
  accent: "sky" | "emerald";
}) {
  const border =
    accent === "sky" ? "border-sky-400/30 bg-sky-500/10" : "border-emerald-400/30 bg-emerald-500/10";
  const titleColor = accent === "sky" ? "text-sky-50" : "text-emerald-50";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <p className={`text-sm font-semibold ${titleColor}`}>{title}</p>
      <p className="text-sm text-ink-dim">{subtitle}</p>
      <dl className="mt-2 space-y-1.5 text-[14px]">
        <div>
          <dt className="text-ink-dim">שם</dt>
          <dd className="font-medium text-white">{name || "—"}</dd>
        </div>
        <div>
          <dt className="text-ink-dim">מותג</dt>
          <dd className="text-white/90">{brand?.trim() || "—"}</dd>
        </div>
        {category ? (
          <div>
            <dt className="text-ink-dim">קטגוריה</dt>
            <dd className="text-white/90">{category}</dd>
          </div>
        ) : null}
      </dl>
      <NutritionMacroTable per={nutrition} basis={basis} />
    </div>
  );
}

/** Resolve OFF / verified macros for items imported before offPer100 was stored. */
export function offReviewNutritionSources(item: OffPendingReview) {
  const link = item.offReviewMeta.verifiedLink;
  const basis = item.per100Basis === "ml" ? "ml" : "g";
  const staged = item.nutrition?.per100g;

  const offPer100 =
    link?.offPer100 ??
    (link?.nutritionFromVerified ? undefined : staged);
  const verifiedPer100 =
    link?.verifiedPer100 ?? (link?.nutritionFromVerified ? staged : undefined);

  const offOnlyPer100 = link ? offPer100 : staged;

  return { link, basis, offPer100, verifiedPer100, offOnlyPer100, staged };
}

type OffVerifiedComparePanelProps = {
  gtin?: string;
  link?: OffVerifiedLinkMeta;
  offName?: string;
  offBrand?: string;
  offPer100?: CatalogNutritionPer100g;
  per100Basis?: CatalogPer100Basis;
  appliedPer100?: CatalogNutritionPer100g;
  showFormHint?: boolean;
};

export function OffVerifiedComparePanel({
  gtin,
  link,
  offName,
  offBrand,
  offPer100,
  per100Basis = "g",
  appliedPer100,
  showFormHint,
}: OffVerifiedComparePanelProps) {
  const displayOffName = link?.offName ?? offName ?? "—";
  const displayOffBrand = link?.offBrand ?? offBrand;
  const offNutrition = link?.offPer100 ?? offPer100;

  if (!link) {
    return (
      <div className="space-y-2">
        <p className="text-[14px] font-semibold text-amber-100/95">
          Open Food Facts — אין התאמה למאגר המאומת
        </p>
        <SourceColumn
          title="Open Food Facts"
          subtitle={gtin ? `ברקוד ${gtin}` : "מקור ברקוד"}
          name={displayOffName}
          brand={displayOffBrand}
          nutrition={offNutrition}
          basis={per100Basis}
          accent="sky"
        />
        <p className="text-sm text-ink-dim leading-relaxed">
          בדקי שם, מותג ותזונה לפני «הוסף למאגר». «ערוך» מאפשר חיפוש במאגר המאומת לפי שם/מותג.
        </p>
      </div>
    );
  }

  const verifiedNutrition = link.verifiedPer100;

  return (
    <div className="space-y-2">
      <p className="text-[14px] font-semibold text-violet-100">השוואה לפני החלטה (לא לפי ברקוד)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SourceColumn
          title="Open Food Facts"
          subtitle={gtin ? `ברקוד ${gtin}` : "מקור ברקוד"}
          name={link.offName}
          brand={link.offBrand}
          nutrition={offNutrition}
          basis={per100Basis}
          accent="sky"
        />
        <SourceColumn
          title="מאגר מאומת"
          subtitle="ללא ברקוד — התאמה לפי שם/מותג"
          name={link.verifiedName}
          brand={link.verifiedBrand}
          category={link.verifiedCategory}
          nutrition={verifiedNutrition}
          basis="g"
          accent="emerald"
        />
      </div>
      <p className="text-sm text-ink-dim leading-relaxed">
        ציון התאמה: {link.matchScore} (אוטו מ־{VERIFIED_AUTO_APPLY_MIN_SCORE}+) · תזונה בטופס:{" "}
        {link.nutritionFromVerified ? "מהמאומת (100g)" : "מ־OFF"}
        {appliedPer100 ?
          ` · נבחר: ${formatMacro(appliedPer100.calories, " קק״ל")}, ח${formatMacro(appliedPer100.proteinG, "g")}, ש${formatMacro(appliedPer100.fatG, "g")}, פ${formatMacro(appliedPer100.carbsG, "g")}`
        : null}
        {!offNutrition && !verifiedNutrition ?
          " · חלק מהערכים חסרים בייבוא ישן"
        : null}
      </p>
      {showFormHint ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-sm text-ink-muted leading-relaxed">
          השדות בעריכה = מה שיישמר במאגר. אם השם/מותג לא תואמים — תקני לפני «הוסף למאגר».
        </p>
      ) : null}
    </div>
  );
}
