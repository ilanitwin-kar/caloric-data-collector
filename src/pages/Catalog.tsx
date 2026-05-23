import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { MinistryPortionsPanel } from "../components/MinistryPortionsPanel";
import { Spinner } from "../components/Spinner";
import { VerifiedSuggestionsPanel } from "../components/VerifiedSuggestionsPanel";
import type { VerifiedSuggestionPick } from "../components/verifiedSuggestionTypes";
import { useCatalog, type CatalogProduct } from "../context/CatalogContext";
import { useToast } from "../context/ToastContext";
import { useCatalogEditSuggestions } from "../hooks/useCatalogEditSuggestions";
import { normalizeBarcode } from "../utils/openFoodFacts";
import { catalogToCsv, parseCatalogCsv } from "../utils/catalogCsv";
import { catalogToPdfBlob, downloadCatalogXlsx } from "../utils/catalogExport";
import { downloadCsv } from "../utils/csv";
import { fmt1, parseNum } from "../utils/number";
import { downloadBlob } from "../utils/share";
import {
  analyzeCatalogCompleteness,
  CATALOG_FIELD_LABELS,
  countCatalogCompleteness,
  matchesCompletenessFilter,
  type CatalogCompletenessFilter,
} from "../utils/catalogCompleteness";
import {
  applyMohPortionsToDraft,
  applyVerifiedFullToDraft,
  applyVerifiedNutritionToDraft,
  parseCatalogEditFocus,
  type CatalogEditFocus,
} from "../utils/catalogEditDraftApply";
import { catalogProductPortionHint } from "../utils/verifiedMeasures";

function matchProduct(p: CatalogProduct, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const code = normalizeBarcode(s);
  if (code.length >= 6) return (p.gtin ?? p.id).includes(code);
  const hay = `${p.name} ${p.shortName ?? ""} ${p.brand ?? ""} ${p.category ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase();
  return hay.includes(s);
}

function csvStamp() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  // Local time stamp to avoid overwriting same-day downloads on mobile.
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function keywordsCell(list?: string[]) {
  if (!list?.length) return "—";
  return list.join(", ");
}

type UsageTag = "ready" | "ingredient" | "raw" | "cooked" | "dry";
type MeasureKey = "unit" | "tbsp" | "tsp" | "cup" | "g100";

const USAGE_OPTIONS: Array<{ id: UsageTag; label: string }> = [
  { id: "ready", label: "מוכן" },
  { id: "ingredient", label: "חומר גלם" },
  { id: "raw", label: "גולמי" },
  { id: "cooked", label: "מבושל" },
  { id: "dry", label: "יבש" },
];

const MEASURE_OPTIONS: Array<{ id: MeasureKey; label: string }> = [
  { id: "unit", label: "יחידה" },
  { id: "tbsp", label: "כף" },
  { id: "tsp", label: "כפית" },
  { id: "cup", label: "כוס" },
  { id: "g100", label: "100g" },
];

function usageCell(list?: string[]) {
  if (!list?.length) return "—";
  const map: Record<string, string> = {
    ready: "מוכן",
    ingredient: "חומר גלם",
    raw: "גולמי",
    cooked: "מבושל",
    dry: "יבש",
  };
  return list.map((x) => map[x] ?? x).join(", ");
}

type EditDraft = {
  id: string;
  gtin: string;
  name: string;
  shortName: string;
  brand: string;
  keywords: string;
  usageTags: UsageTag[];
  category: string;
  per100Basis: "g" | "ml";
  defaultMeasure: MeasureKey;
  commonMeasures: MeasureKey[];
  totalWeightG: string;
  unitsPerPack: string;
  unitWeightG: string;
  calories100: string;
  protein100: string;
  carbs100: string;
  fat100: string;
  unitsPer100g: string;
  tbspPer100g: string;
  tspPer100g: string;
  cupsPer100g: string;
};

function productToDraft(p: CatalogProduct): EditDraft {
  const per = p.nutrition?.per100g;
  const tags = (p.usageTags as UsageTag[] | undefined) ?? [];
  const basis = (p.per100Basis as "g" | "ml" | undefined) ?? "g";
  const dm = (p.defaultMeasure as MeasureKey | undefined) ?? (p.id.startsWith("internal:") ? "g100" : "unit");
  const cmRaw = (p.commonMeasures as MeasureKey[] | undefined) ?? [dm, "g100"];
  const cm = Array.from(new Set([dm, ...cmRaw])).slice(0, 4);
  return {
    id: p.id,
    gtin: p.gtin ?? "",
    name: p.name ?? "",
    shortName: p.shortName ?? "",
    brand: p.brand ?? "",
    keywords: (p.keywords ?? []).join(", "),
    usageTags: tags.length ? tags : p.id.startsWith("internal:") ? ["ingredient"] : ["ready"],
    category: p.category ?? "",
    per100Basis: basis,
    defaultMeasure: dm,
    commonMeasures: cm,
    totalWeightG: p.package?.totalWeightG != null ? String(p.package.totalWeightG) : "",
    unitsPerPack: p.package?.unitsPerPack != null ? String(p.package.unitsPerPack) : "",
    unitWeightG: p.package?.unitWeightG != null ? fmt1(p.package.unitWeightG) : "",
    calories100: per?.calories != null ? String(per.calories) : "",
    protein100: per?.proteinG != null ? String(per.proteinG) : "",
    carbs100: per?.carbsG != null ? String(per.carbsG) : "",
    fat100: per?.fatG != null ? String(per.fatG) : "",
    unitsPer100g: p.measures?.unitsPer100g != null ? String(p.measures.unitsPer100g) : "",
    tbspPer100g: p.measures?.tbspPer100g != null ? String(p.measures.tbspPer100g) : "",
    tspPer100g: p.measures?.tspPer100g != null ? String(p.measures.tspPer100g) : "",
    cupsPer100g: p.measures?.cupsPer100g != null ? String(p.measures.cupsPer100g) : "",
  };
}

function sourceLabel(p: CatalogProduct): string {
  const types = p.sources?.map((s) => s.type) ?? [];
  const parts: string[] = [];
  if (types.includes("barcode_openfoodfacts")) parts.push("OFF");
  if (types.includes("verified100")) parts.push("מאומת");
  if (types.includes("manual")) parts.push("ידני");
  if (types.includes("ocr")) parts.push("OCR");
  if (parts.length === 0) return p.id.startsWith("internal:") ? "פנימי" : "—";
  return parts.join(" + ");
}

function CompletenessBadge({
  ok,
  label,
  warn,
  onAction,
}: {
  ok: boolean;
  label: string;
  warn?: boolean;
  onAction?: () => void;
}) {
  const className =
    "rounded-md border px-1.5 py-0.5 text-[9px] font-semibold " +
    (ok ?
      "border-emerald-400/35 bg-emerald-500/10 text-emerald-100"
    : warn ?
      "border-amber-400/35 bg-amber-500/10 text-amber-100"
    : "border-white/15 bg-white/[0.04] text-ink-muted");

  if (ok || !onAction) {
    return <span className={className}>{label}</span>;
  }

  return (
    <button
      type="button"
      onClick={onAction}
      className={
        className +
        " cursor-pointer transition hover:brightness-125 hover:border-white/30 underline-offset-2 hover:underline"
      }
    >
      {label} →
    </button>
  );
}

function CatalogProductCard({
  product: p,
  onEdit,
  onEditWithFocus,
  onDelete,
}: {
  product: CatalogProduct;
  onEdit: () => void;
  onEditWithFocus: (focus: CatalogEditFocus) => void;
  onDelete: () => void;
}) {
  const per = p.nutrition?.per100g;
  const report = analyzeCatalogCompleteness(p);
  const basis = p.per100Basis === "ml" ? "מ״ל" : "g";
  const filledLabels = report.filled.map((k) => CATALOG_FIELD_LABELS[k]);
  const missingRecommendedLabels = report.missingRecommended.map((k) => CATALOG_FIELD_LABELS[k]);
  const missingOptionalLabels = report.missingOptional.map((k) => CATALOG_FIELD_LABELS[k]);

  const nutritionOk =
    report.filled.includes("calories") &&
    report.filled.includes("protein") &&
    report.filled.includes("carbs") &&
    report.filled.includes("fat");
  const packageOk = report.hasPackage;
  const portionsOk = report.portionLevel === "full";
  const portionWarn = report.portionLevel === "packageOnly";

  return (
    <li className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-lg font-semibold text-white">{p.name}</p>
          {p.brand ? <p className="text-sm text-ink-muted">{p.brand}</p> : null}
          {p.category ? <p className="text-[11px] text-ink-dim">{p.category}</p> : null}
          <p className="mt-1 font-mono text-xs text-ink-dim" dir="ltr">
            {p.gtin ?? p.id}
          </p>
          <p className="mt-1 text-[10px] text-ink-dim">
            מקור: {sourceLabel(p)} · {report.recommendedScore.filled}/
            {report.recommendedScore.total} שדות מומלצים
          </p>
        </div>
        <div className="shrink-0 flex items-center gap-2">
          <button
            type="button"
            onClick={onEdit}
            className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30"
          >
            עריכה
          </button>
          <button
            type="button"
            onClick={onDelete}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400/45 hover:bg-red-500/15"
          >
            מחק
          </button>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1">
        <CompletenessBadge
          ok={nutritionOk}
          label={nutritionOk ? "תזונה ✓" : "חסר תזונה"}
          onAction={!nutritionOk ? () => onEditWithFocus("nutrition") : undefined}
        />
        <CompletenessBadge
          ok={packageOk}
          label={packageOk ? "אריזה ✓" : "חסר אריזה"}
          warn={!packageOk}
          onAction={!packageOk ? () => onEditWithFocus("packaging") : undefined}
        />
        <CompletenessBadge
          ok={portionsOk}
          label={
            portionsOk ?
              `מידות ✓${report.portionHint ? ` · ${report.portionHint}` : ""}`
            : portionWarn ?
              `אריזה OFF${report.portionHint ? ` · ${report.portionHint}` : ""}`
            : "חסר מידות"
          }
          warn={portionWarn}
          onAction={
            !portionsOk || portionWarn ? () => onEditWithFocus("measures") : undefined
          }
        />
        {report.isComplete ? (
          <span className="rounded-md border border-sky-400/35 bg-sky-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-sky-100">
            מלא ✓
          </span>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-ink-muted">קל׳ ל־100{basis}</span>
          <p className="tabular-nums text-white">{per?.calories != null ? fmt1(per.calories) : "—"}</p>
        </div>
        <div>
          <span className="text-ink-muted">חלבון</span>
          <p className="tabular-nums text-white">{per?.proteinG != null ? fmt1(per.proteinG) : "—"}</p>
        </div>
        <div>
          <span className="text-ink-muted">פחמ׳</span>
          <p className="tabular-nums text-white">{per?.carbsG != null ? fmt1(per.carbsG) : "—"}</p>
        </div>
        <div>
          <span className="text-ink-muted">שומן</span>
          <p className="tabular-nums text-white">{per?.fatG != null ? fmt1(per.fatG) : "—"}</p>
        </div>
      </div>

      <details className="group mt-3 rounded-xl border border-white/10 bg-white/[0.02]">
        <summary className="cursor-pointer list-none px-3 py-2 text-[11px] font-semibold text-ink-muted marker:content-none [&::-webkit-details-marker]:hidden">
          <span className="flex items-center justify-between gap-2">
            <span>פרטים — מה מולא / מה חסר</span>
            <span className="text-[10px] text-ink-dim group-open:rotate-180 transition">▼</span>
          </span>
        </summary>
        <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2 text-[11px] leading-relaxed">
          {p.package?.totalWeightG || p.package?.unitWeightG ? (
            <p className="text-ink-muted">
              <span className="font-semibold text-white/90">אריזה: </span>
              {p.package.totalWeightG ? `${fmt1(p.package.totalWeightG)}${basis}` : "—"}
              {p.package.unitsPerPack ? ` · ${p.package.unitsPerPack} יח׳` : ""}
              {p.package.unitWeightG ? ` · ~${fmt1(p.package.unitWeightG)}g/יח׳` : ""}
            </p>
          ) : (
            <p className="text-ink-dim">אריזה: לא מולא</p>
          )}
          {catalogProductPortionHint(p) ? (
            <p className="text-ink-muted">
              <span className="font-semibold text-white/90">מידות: </span>
              {catalogProductPortionHint(p)}
            </p>
          ) : (
            <p className="text-ink-dim">מידות: לא מולא</p>
          )}
          {p.usageTags?.length ? (
            <p className="text-ink-dim">שימוש: {usageCell(p.usageTags as string[])}</p>
          ) : null}
          {p.keywords?.length ? (
            <p className="text-ink-dim">מילים: {keywordsCell(p.keywords)}</p>
          ) : null}
          {filledLabels.length > 0 ? (
            <p className="text-emerald-100/90">
              <span className="font-semibold">מולא: </span>
              {filledLabels.join(" · ")}
            </p>
          ) : null}
          {missingRecommendedLabels.length > 0 ? (
            <p className="text-rose-200/90">
              <span className="font-semibold">חסר (מומלץ): </span>
              {missingRecommendedLabels.join(" · ")}
            </p>
          ) : null}
          {missingOptionalLabels.length > 0 ? (
            <p className="text-ink-dim">
              <span className="font-semibold">אופציונלי חסר: </span>
              {missingOptionalLabels.join(" · ")}
            </p>
          ) : null}
        </div>
      </details>
    </li>
  );
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-muted">{label}</label>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-[48px] w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
      />
    </div>
  );
}

function parseKeywords(raw: string): string[] | undefined {
  const list = raw
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function computeDerivedPackage(d: EditDraft) {
  const tw = parseNum(d.totalWeightG);
  const u = parseNum(d.unitsPerPack);
  const uw = parseNum(d.unitWeightG);
  const totalWeightG = tw > 0 ? tw : undefined;
  const unitsPerPack = u > 0 ? u : undefined;
  const unitWeightG =
    uw > 0
      ? uw
      : totalWeightG && unitsPerPack
        ? totalWeightG / unitsPerPack
        : undefined;
  return { totalWeightG, unitsPerPack, unitWeightG };
}

function editSectionRing(active: boolean, accent: "emerald" | "teal"): string {
  if (!active) return "space-y-3";
  const ring =
    accent === "emerald" ? "ring-emerald-400/50" : "ring-teal-400/50";
  return `space-y-3 rounded-xl p-2 -mx-2 ring-2 ${ring} ring-offset-2 ring-offset-neutral-950`;
}

function EditModal({
  product,
  initialFocus,
  onClose,
}: {
  product: CatalogProduct | null;
  initialFocus: CatalogEditFocus;
  onClose: () => void;
}) {
  const { updateProduct, deleteProduct } = useCatalog();
  const [draft, setDraft] = useState<EditDraft | null>(product ? productToDraft(product) : null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const nutritionSectionRef = useRef<HTMLDivElement>(null);
  const packagingSectionRef = useRef<HTMLDivElement>(null);
  const measuresSectionRef = useRef<HTMLDivElement>(null);

  const suggestions = useCatalogEditSuggestions(product?.id ?? null, draft, Boolean(product && draft));

  useEffect(() => {
    setDraft(product ? productToDraft(product) : null);
  }, [product]);

  useEffect(() => {
    if (!product || initialFocus === "general") return;
    const target =
      initialFocus === "nutrition" ? nutritionSectionRef
      : initialFocus === "measures" ? measuresSectionRef
      : packagingSectionRef;
    const t = window.setTimeout(() => {
      target.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 150);
    return () => window.clearTimeout(t);
  }, [product?.id, initialFocus]);

  const applyVerifiedPickNutrition = (sug: VerifiedSuggestionPick) => {
    setDraft((d) => (d ? applyVerifiedNutritionToDraft(d, sug) : d));
    suggestions.onVerifiedPicked();
  };

  const applyVerifiedPickFull = (sug: VerifiedSuggestionPick) => {
    setDraft((d) => (d ? applyVerifiedFullToDraft(d, sug) : d));
    suggestions.onVerifiedPicked();
  };

  const applyMohPortions = (sug: VerifiedSuggestionPick) => {
    setDraft((d) => (d ? applyMohPortionsToDraft(d, sug) : d));
    suggestions.onMohApproved(sug);
  };

  if (!product || !draft) return null;

  const productId = product.id;
  const pkg = computeDerivedPackage(draft);

  async function handleSave() {
    const d = draft;
    const p = product;
    if (!d || !p) return;

    const name = d.name.trim();
    if (!name) return;
    setSaving(true);
    try {
      const next: CatalogProduct = {
        ...p,
        name,
        shortName: d.shortName.trim() || undefined,
        brand: d.brand.trim() || undefined,
        keywords: parseKeywords(d.keywords),
        category: d.category.trim() || undefined,
        usageTags: d.usageTags.length ? d.usageTags : undefined,
        per100Basis: d.per100Basis,
        defaultMeasure: d.defaultMeasure,
        commonMeasures: d.commonMeasures,
        package: {
          totalWeightG: pkg.totalWeightG,
          unitsPerPack: pkg.unitsPerPack,
          unitWeightG: pkg.unitWeightG,
        },
        measures: {
          unitsPer100g: (() => {
            const n = parseNum(d.unitsPer100g);
            return n > 0 ? n : undefined;
          })(),
          tbspPer100g: (() => {
            const n = parseNum(d.tbspPer100g);
            return n > 0 ? n : undefined;
          })(),
          tspPer100g: (() => {
            const n = parseNum(d.tspPer100g);
            return n > 0 ? n : undefined;
          })(),
          cupsPer100g: (() => {
            const n = parseNum(d.cupsPer100g);
            return n > 0 ? n : undefined;
          })(),
        },
        nutrition: {
          per100g: {
            calories: (() => {
              const n = parseNum(d.calories100);
              return Number.isFinite(n) ? n : undefined;
            })(),
            proteinG: (() => {
              const n = parseNum(d.protein100);
              return Number.isFinite(n) ? n : undefined;
            })(),
            carbsG: (() => {
              const n = parseNum(d.carbs100);
              return Number.isFinite(n) ? n : undefined;
            })(),
            fatG: (() => {
              const n = parseNum(d.fat100);
              return Number.isFinite(n) ? n : undefined;
            })(),
          },
        },
      };
      await updateProduct(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("למחוק מוצר מהמאגר?")) return;
    setDeleting(true);
    try {
      await deleteProduct(productId);
      onClose();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[200] flex items-end justify-center bg-black/75 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-title"
    >
      <button type="button" className="absolute inset-0 cursor-default bg-transparent" aria-label="סגור" onClick={onClose} />
      <div className="relative z-10 flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-white/15 bg-neutral-950 shadow-xl">
        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <h2 id="edit-title" className="text-base font-semibold text-white">
            עריכת מוצר
          </h2>
          <p className="mt-1 font-mono text-[11px] text-ink-dim" dir="ltr">
            {product.id}
          </p>
        </div>
        <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
          {initialFocus !== "general" ? (
            <p className="rounded-xl border border-teal-400/25 bg-teal-500/10 px-3 py-2 text-[11px] text-teal-50">
              {initialFocus === "nutrition" ?
                "מילוי תזונה — הצעות מהמאגר המאומת (TSV)"
              : initialFocus === "packaging" ?
                "מילוי אריזה — הצעות ממשרד הבריאות (לא משנה תזונה)"
              : "מילוי מידות — הצעות ממשרד הבריאות"}
            </p>
          ) : null}

          <Field label="שם" value={draft.name} onChange={(v) => setDraft((d) => (d ? { ...d, name: v } : d))} />
          <Field
            label="שם קצר ליומן (אופציונלי)"
            value={draft.shortName}
            onChange={(v) => setDraft((d) => (d ? { ...d, shortName: v } : d))}
            placeholder="למשל עמק 9%"
          />
          <Field label="מותג" value={draft.brand} onChange={(v) => setDraft((d) => (d ? { ...d, brand: v } : d))} />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-muted">הערכים הם ל־</p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setDraft((d) => (d ? { ...d, per100Basis: "g" } : d))}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                  (draft.per100Basis === "g"
                    ? "border border-white/20 bg-white/[0.12] text-white"
                    : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                }
              >
                100g
              </button>
              <button
                type="button"
                onClick={() => setDraft((d) => (d ? { ...d, per100Basis: "ml" } : d))}
                className={
                  "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                  (draft.per100Basis === "ml"
                    ? "border border-white/20 bg-white/[0.12] text-white"
                    : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                }
              >
                100ml
              </button>
            </div>
          </div>
          <Field label="קטגוריה" value={draft.category} onChange={(v) => setDraft((d) => (d ? { ...d, category: v } : d))} />
          <Field label="מילות חיפוש (פסיקים)" value={draft.keywords} onChange={(v) => setDraft((d) => (d ? { ...d, keywords: v } : d))} />
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-muted">סוג שימוש</p>
            <div className="flex flex-wrap gap-2">
              {USAGE_OPTIONS.map((opt) => {
                const active = draft.usageTags.includes(opt.id);
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              usageTags: active
                                ? prev.usageTags.filter((x) => x !== opt.id)
                                : [...prev.usageTags, opt.id],
                            }
                          : prev,
                      )
                    }
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                      (active
                        ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-50"
                        : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
          <div className="space-y-1.5">
            <p className="text-xs font-medium text-ink-muted">ברירת מחדל ביומן</p>
            <div className="flex flex-wrap gap-2">
              {MEASURE_OPTIONS.map((opt) => {
                const active = draft.defaultMeasure === opt.id;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() =>
                      setDraft((prev) =>
                        prev
                          ? {
                              ...prev,
                              defaultMeasure: opt.id,
                              commonMeasures: Array.from(new Set([opt.id, ...prev.commonMeasures])).slice(0, 4),
                            }
                          : prev,
                      )
                    }
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                      (active
                        ? "border border-sky-300/30 bg-sky-500/15 text-sky-50"
                        : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-2 text-xs font-medium text-ink-muted">מידות נפוצות</p>
            <div className="flex flex-wrap gap-2">
              {MEASURE_OPTIONS.map((opt) => {
                const active = draft.commonMeasures.includes(opt.id);
                return (
                  <button
                    key={`cm-${opt.id}`}
                    type="button"
                    onClick={() =>
                      setDraft((prev) => {
                        if (!prev) return prev;
                        const next = prev.commonMeasures.includes(opt.id)
                          ? prev.commonMeasures.filter((x) => x !== opt.id)
                          : [...prev.commonMeasures, opt.id];
                        const withDefault = next.includes(prev.defaultMeasure)
                          ? next
                          : [prev.defaultMeasure, ...next];
                        return { ...prev, commonMeasures: withDefault.slice(0, 4) };
                      })
                    }
                    className={
                      "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                      (active
                        ? "border border-white/20 bg-white/[0.12] text-white"
                        : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                    }
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div
            ref={nutritionSectionRef}
            className={editSectionRing(
              initialFocus === "nutrition",
              "emerald",
            )}
          >
            <p className="text-xs font-semibold text-emerald-100">תזונה ל־100g</p>
            {draft.per100Basis === "g" ? (
              <VerifiedSuggestionsPanel
                suggestions={suggestions.verifiedSuggestions}
                verifiedPicked={suggestions.verifiedPicked}
                isAlreadyInCatalog={false}
                searchQuery={suggestions.searchQuery}
                onPickNutrition={applyVerifiedPickNutrition}
                onPickFull={applyVerifiedPickFull}
                onClearPicked={suggestions.clearVerifiedPicked}
                onDismiss={suggestions.dismissVerified}
              />
            ) : (
              <p className="text-[11px] text-ink-dim">
                הצעות TSV זמינות ל־100g — עבורי ל־100g אם המוצר מוצג לפי משקל.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label='קלוריות ל־100g' value={draft.calories100} onChange={(v) => setDraft((d) => (d ? { ...d, calories100: v } : d))} inputMode="decimal" />
              <Field label="חלבון ל־100g" value={draft.protein100} onChange={(v) => setDraft((d) => (d ? { ...d, protein100: v } : d))} inputMode="decimal" />
              <Field label="פחמימות ל־100g" value={draft.carbs100} onChange={(v) => setDraft((d) => (d ? { ...d, carbs100: v } : d))} inputMode="decimal" />
              <Field label="שומן ל־100g" value={draft.fat100} onChange={(v) => setDraft((d) => (d ? { ...d, fat100: v } : d))} inputMode="decimal" />
            </div>
          </div>

          <div
            ref={packagingSectionRef}
            className={editSectionRing(
              initialFocus === "packaging",
              "teal",
            )}
          >
            <p className="text-xs font-semibold text-teal-100">אריזה</p>
            {draft.per100Basis === "g" ? (
              <MinistryPortionsPanel
                suggestions={suggestions.mohSuggestions}
                searchQuery={suggestions.searchQuery}
                nutritionReady={suggestions.nutritionReady}
                pickedLabel={suggestions.mohPickedLabel}
                onApprove={applyMohPortions}
                onClearPicked={suggestions.clearMohPicked}
                onDismiss={suggestions.dismissMoh}
              />
            ) : (
              <p className="text-[11px] text-ink-dim">
                הצעות משרד הבריאות זמינות למוצרים לפי 100g.
              </p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <Field label="משקל אריזה (g)" value={draft.totalWeightG} onChange={(v) => setDraft((d) => (d ? { ...d, totalWeightG: v } : d))} inputMode="decimal" />
              <Field label="יחידות באריזה" value={draft.unitsPerPack} onChange={(v) => setDraft((d) => (d ? { ...d, unitsPerPack: v } : d))} inputMode="decimal" />
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ink-muted">
              משקל יחידה מחושב: {pkg.unitWeightG ? `${fmt1(pkg.unitWeightG)}g` : "—"}
            </div>
          </div>

          <div
            ref={measuresSectionRef}
            className={editSectionRing(initialFocus === "measures", "teal")}
          >
            <p className="text-xs font-semibold text-teal-100">מידות (כף / כוס / יחידה)</p>
            {initialFocus === "measures" && draft.per100Basis === "g" && !suggestions.nutritionReady ? (
              <p className="text-[11px] text-amber-100/90">
                מלאי קודם תזונה ל־100g — ואז יופיעו הצעות משרד הבריאות ב«אריזה» למעלה.
              </p>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
            <Field
              label="גרם בכוס (סטנדרט)"
              value={(() => {
                const n = parseNum(draft.cupsPer100g);
                if (!(n > 0)) return "";
                return fmt1(100 / n);
              })()}
              onChange={(v) => {
                const per = parseNum(v);
                setDraft((d) => (d ? { ...d, cupsPer100g: per > 0 ? String(100 / per) : "" } : d));
              }}
              inputMode="decimal"
            />
            <Field
              label="גרם בכף"
              value={(() => {
                const n = parseNum(draft.tbspPer100g);
                if (!(n > 0)) return "";
                return fmt1(100 / n);
              })()}
              onChange={(v) => {
                const per = parseNum(v);
                setDraft((d) => (d ? { ...d, tbspPer100g: per > 0 ? String(100 / per) : "" } : d));
              }}
              inputMode="decimal"
            />
            <Field
              label="גרם בכפית"
              value={(() => {
                const n = parseNum(draft.tspPer100g);
                if (!(n > 0)) return "";
                return fmt1(100 / n);
              })()}
              onChange={(v) => {
                const per = parseNum(v);
                setDraft((d) => (d ? { ...d, tspPer100g: per > 0 ? String(100 / per) : "" } : d));
              }}
              inputMode="decimal"
            />
            <Field
              label="גרם ליחידה (אם רלוונטי)"
              value={(() => {
                const n = parseNum(draft.unitsPer100g);
                if (!(n > 0)) return "";
                return fmt1(100 / n);
              })()}
              onChange={(v) => {
                const per = parseNum(v);
                setDraft((d) => (d ? { ...d, unitsPer100g: per > 0 ? String(100 / per) : "" } : d));
              }}
              inputMode="decimal"
            />
          </div>
          </div>
        </div>
        <div className="flex shrink-0 gap-2 border-t border-white/10 p-3">
          <button
            type="button"
            onClick={handleDelete}
            disabled={saving || deleting}
            className="min-h-[44px] rounded-xl border border-red-400/35 bg-red-500/10 px-4 text-sm font-semibold text-red-200 transition disabled:opacity-60"
          >
            {deleting ? "מוחק…" : "מחיקה"}
          </button>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || deleting}
            className="min-h-[44px] flex-1 rounded-xl border border-white/20 bg-transparent text-sm font-medium text-ink-muted transition hover:border-white/30 hover:text-white disabled:opacity-60"
          >
            ביטול
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || deleting}
            className="min-h-[44px] flex-1 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-60"
          >
            {saving ? "שומר…" : "שמור"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function Catalog() {
  const { catalog, loading, error, cloudSyncPaused, pauseCloudSync, resumeCloudSync, bulkUpsert, deleteProduct } =
    useCatalog();
  const { showToast } = useToast();
  const [searchParams] = useSearchParams();
  const [q, setQ] = useState("");
  const [completenessFilter, setCompletenessFilter] = useState<CatalogCompletenessFilter>("all");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [editFocus, setEditFocus] = useState<CatalogEditFocus>("general");
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState<null | "csv" | "xlsx" | "pdf">(null);

  const openEdit = (p: CatalogProduct, focus: CatalogEditFocus = "general") => {
    setEditing(p);
    setEditFocus(focus);
  };

  useEffect(() => {
    const qp = (searchParams.get("q") ?? "").trim();
    const editId = (searchParams.get("edit") ?? "").trim();
    const focusParam = parseCatalogEditFocus(searchParams.get("focus"));

    if (qp) setQ(qp);

    if (editId) {
      const p = catalog.find((x) => x.id === editId || x.gtin === editId);
      if (p) {
        setEditing(p);
        setEditFocus(focusParam ?? "general");
      }
    }
  }, [searchParams, catalog]);

  const filtered = useMemo(
    () =>
      catalog.filter(
        (p) => matchProduct(p, q) && matchesCompletenessFilter(p, completenessFilter),
      ),
    [catalog, q, completenessFilter],
  );

  const completenessTotals = useMemo(() => countCatalogCompleteness(catalog), [catalog]);

  async function handleImport(file: File) {
    const text = await file.text();
    const rows = parseCatalogCsv(text);
    if (rows.length === 0) {
      showToast("לא זוהו נתונים בקובץ", "error");
      return;
    }
    const now = new Date().toISOString();
    const products: CatalogProduct[] = rows.map((r) => {
      const totalWeightG = r.totalWeightG && r.totalWeightG > 0 ? r.totalWeightG : undefined;
      const unitsPerPack = r.unitsPerPack && r.unitsPerPack > 0 ? r.unitsPerPack : undefined;
      const unitWeightG =
        totalWeightG && unitsPerPack ? totalWeightG / unitsPerPack : undefined;
      return {
        id: r.id,
        gtin: r.gtin,
        name: r.name,
        shortName: (r.shortName ?? "").trim() || undefined,
        brand: r.brand,
        keywords: r.keywords,
        category: r.category,
        usageTags: (r.usageTags as UsageTag[] | undefined) ?? undefined,
        per100Basis: (r.per100Basis as "g" | "ml" | undefined) ?? "g",
        defaultMeasure: (r.defaultMeasure as MeasureKey | undefined) ?? undefined,
        commonMeasures: (r.commonMeasures as MeasureKey[] | undefined) ?? undefined,
        createdAt: now,
        updatedAt: now,
        package: { totalWeightG, unitsPerPack, unitWeightG },
        measures: {
          unitsPer100g: r.unitsPer100g,
          tbspPer100g: r.tbspPer100g,
          tspPer100g: r.tspPer100g,
          cupsPer100g: r.cupsPer100g,
        },
        nutrition: {
          per100g: {
            calories: r.calories100,
            proteinG: r.protein100,
            carbsG: r.carbs100,
            fatG: r.fat100,
          },
        },
      };
    });
    await bulkUpsert(products);
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <div className="flex items-start justify-between gap-3">
          <p className="font-display min-w-0 flex-1 text-3xl font-semibold tracking-tight text-white md:text-4xl">
            מאגר
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => {
                setExporting("csv");
                try {
                  const csv = catalogToCsv(catalog);
                  downloadCsv(`catalog-${csvStamp()}.csv`, csv);
                } finally {
                  setExporting(null);
                }
              }}
              className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 disabled:opacity-60"
            >
              {exporting === "csv" ? "מכין…" : "CSV"}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => {
                setExporting("xlsx");
                void downloadCatalogXlsx(catalog, `catalog-${csvStamp()}.xlsx`)
                  .catch(() => showToast("ייצוא Excel נכשל", "error"))
                  .finally(() => setExporting(null));
              }}
              className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 disabled:opacity-60"
            >
              {exporting === "xlsx" ? "מכין…" : "Excel"}
            </button>
            <button
              type="button"
              disabled={exporting !== null}
              onClick={() => {
                setExporting("pdf");
                void catalogToPdfBlob(catalog)
                  .then((blob) => downloadBlob(blob, `catalog-${csvStamp()}.pdf`))
                  .catch(() => showToast("ייצוא PDF נכשל", "error"))
                  .finally(() => setExporting(null));
              }}
              className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30 disabled:opacity-60"
            >
              {exporting === "pdf" ? "מכין…" : "PDF"}
            </button>
          </div>
        </div>
        <p className="text-xs text-ink-muted">
          {catalog.length.toLocaleString("he-IL")} מוצרים · חיפוש כולל גם מילות מפתח.
        </p>
        {!loading && catalog.length > 0 ? (
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-ink-muted leading-relaxed space-y-1">
            <p>
              <span className="text-sky-200/90">
                {completenessTotals.complete.toLocaleString("he-IL")} מלאים
              </span>
              {" · "}
              <span className="text-emerald-200/90">
                {completenessTotals.withCalories.toLocaleString("he-IL")} עם קלוריות
              </span>
              {" · "}
              <span className="text-emerald-200/90">
                {completenessTotals.withFullPortions.toLocaleString("he-IL")} עם מידות
              </span>
            </p>
            <p>
              <span className="text-amber-200/90">
                {completenessTotals.packageOnly.toLocaleString("he-IL")} אריזה OFF בלבד
              </span>
              {" · "}
              <span className="text-ink-dim">
                {completenessTotals.noPortions.toLocaleString("he-IL")} ללא מידות
              </span>
              {completenessTotals.missingNutrition > 0 ? (
                <>
                  {" · "}
                  <span className="text-rose-200/90">
                    {completenessTotals.missingNutrition.toLocaleString("he-IL")} חסר תזונה
                  </span>
                </>
              ) : null}
            </p>
          </div>
        ) : null}
        <div className="flex flex-wrap gap-2" role="group" aria-label="סינון שלמות">
          {(
            [
              ["all", "הכל"],
              ["complete", "מלא"],
              ["missingNutrition", "חסר תזונה"],
              ["missingPortions", "חסר מידות"],
              ["packageOnly", "אריזה OFF בלבד"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setCompletenessFilter(id)}
              className={
                "rounded-lg border px-2.5 py-1.5 text-[11px] font-semibold transition " +
                (completenessFilter === id ?
                  "border-white/30 bg-white/[0.1] text-white"
                : "border-white/10 bg-transparent text-ink-muted hover:border-white/20 hover:text-white")
              }
            >
              {label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="חיפוש לפי שם / מותג / מילים / ברקוד…"
            className="min-h-[48px] flex-1 rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30"
          >
            ייבוא CSV
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              void handleImport(f);
            }}
          />
        </div>
        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="!h-5 !w-5" />
            טוען מהענן…
          </div>
        ) : null}
        {error ? (
          <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
            <p className="text-xs text-amber-200">{error}</p>
            {!cloudSyncPaused ? (
              <button
                type="button"
                onClick={pauseCloudSync}
                className="mt-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/90"
              >
                עצור סנכרון
              </button>
            ) : (
              <button
                type="button"
                onClick={resumeCloudSync}
                className="mt-2 rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-xs font-semibold text-white/90"
              >
                נסה שוב
              </button>
            )}
          </div>
        ) : null}
      </header>

      <ul className="space-y-3">
        {!loading && filtered.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-10 text-center text-sm text-ink-muted">
            אין תוצאות
          </li>
        ) : null}
        {filtered.map((p) => (
          <CatalogProductCard
            key={p.id}
            product={p}
            onEdit={() => openEdit(p, "general")}
            onEditWithFocus={(focus) => openEdit(p, focus)}
            onDelete={() => {
              if (!window.confirm("למחוק מוצר מהמאגר?")) return;
              void deleteProduct(p.id).catch(() => showToast("מחיקה נכשלה", "error"));
            }}
          />
        ))}
      </ul>

      <EditModal
        product={editing}
        initialFocus={editFocus}
        onClose={() => {
          setEditing(null);
          setEditFocus("general");
        }}
      />
    </div>
  );
}

