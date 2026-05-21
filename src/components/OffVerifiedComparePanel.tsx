import type { CatalogNutritionPer100g } from "../context/CatalogContext";
import type { OffVerifiedLinkMeta } from "../utils/offCatalog";
import { VERIFIED_AUTO_APPLY_MIN_SCORE } from "../utils/verifiedTsv";

function formatPer100(per?: CatalogNutritionPer100g): string {
  if (!per) return "—";
  const parts: string[] = [];
  if (per.calories != null) parts.push(`${per.calories} קק״ל`);
  if (per.proteinG != null) parts.push(`חלבון ${per.proteinG}g`);
  if (per.carbsG != null) parts.push(`פחמ׳ ${per.carbsG}g`);
  if (per.fatG != null) parts.push(`שומן ${per.fatG}g`);
  return parts.length ? parts.join(" · ") : "—";
}

function SourceColumn({
  title,
  subtitle,
  name,
  brand,
  category,
  nutrition,
  accent,
}: {
  title: string;
  subtitle: string;
  name: string;
  brand?: string;
  category?: string;
  nutrition?: CatalogNutritionPer100g;
  accent: "sky" | "emerald";
}) {
  const border =
    accent === "sky" ? "border-sky-400/30 bg-sky-500/10" : "border-emerald-400/30 bg-emerald-500/10";
  const titleColor = accent === "sky" ? "text-sky-50" : "text-emerald-50";
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${border}`}>
      <p className={`text-xs font-semibold ${titleColor}`}>{title}</p>
      <p className="text-[10px] text-ink-dim">{subtitle}</p>
      <dl className="mt-2 space-y-1.5 text-[11px]">
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
        <div>
          <dt className="text-ink-dim">תזונה ל־100g</dt>
          <dd className="text-white/90 leading-snug">{formatPer100(nutrition)}</dd>
        </div>
      </dl>
    </div>
  );
}

type OffVerifiedComparePanelProps = {
  gtin?: string;
  link?: OffVerifiedLinkMeta;
  /** Current staged/saved nutrition (what the form uses). */
  appliedPer100?: CatalogNutritionPer100g;
  showFormHint?: boolean;
};

export function OffVerifiedComparePanel({
  gtin,
  link,
  appliedPer100,
  showFormHint,
}: OffVerifiedComparePanelProps) {
  if (!link) {
    return (
      <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] leading-relaxed text-ink-muted">
        <p className="font-semibold text-amber-100/95">אין התאמה למאגר המאומת</p>
        <p className="mt-1">
          רק נתוני OFF (ברקוד {gtin ?? "—"}). בדקי שם ומותג לפני הוספה למאגר.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[11px] font-semibold text-violet-100">השוואה לפני החלטה — שם ומותג (לא ברקוד)</p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <SourceColumn
          title="Open Food Facts"
          subtitle={gtin ? `ברקוד ${gtin}` : "מקור ברקוד"}
          name={link.offName}
          brand={link.offBrand}
          nutrition={link.offPer100}
          accent="sky"
        />
        <SourceColumn
          title="מאגר מאומת"
          subtitle="ללא ברקוד — התאמה לפי שם/מותג"
          name={link.verifiedName}
          brand={link.verifiedBrand}
          category={link.verifiedCategory}
          nutrition={link.verifiedPer100}
          accent="emerald"
        />
      </div>
      <p className="text-[10px] text-ink-dim leading-relaxed">
        ציון התאמה: {link.matchScore} (אוטו מ־{VERIFIED_AUTO_APPLY_MIN_SCORE}+) · תזונה בטופס:{" "}
        {link.nutritionFromVerified ? "מהמאומת" : "מ־OFF"}
        {appliedPer100 ? ` · ${formatPer100(appliedPer100)}` : ""}
      </p>
      {showFormHint ? (
        <p className="rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-2 text-[10px] text-ink-muted leading-relaxed">
          השדות למטה = מה שיישמר במאגר. אם השם/מותג לא תואמים — ערכי בטופס לפני «הוסף למאגר».
        </p>
      ) : null}
    </div>
  );
}
