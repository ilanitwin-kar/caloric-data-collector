import { useEffect, useMemo, useRef, useState } from "react";
import { Spinner } from "../components/Spinner";
import { useCatalog, type CatalogProduct } from "../context/CatalogContext";
import { useToast } from "../context/ToastContext";
import { normalizeBarcode } from "../utils/openFoodFacts";
import { catalogToCsv, parseCatalogCsv } from "../utils/catalogCsv";
import { catalogToPdfBlob, downloadCatalogXlsx } from "../utils/catalogExport";
import { downloadCsv } from "../utils/csv";
import { fmt1, parseNum } from "../utils/number";
import { downloadBlob } from "../utils/share";

function matchProduct(p: CatalogProduct, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const code = normalizeBarcode(s);
  if (code.length >= 6) return (p.gtin ?? p.id).includes(code);
  const hay = `${p.name} ${p.brand ?? ""} ${p.category ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase();
  return hay.includes(s);
}

function csvStamp() {
  return new Date().toISOString().slice(0, 10);
}

function keywordsCell(list?: string[]) {
  if (!list?.length) return "—";
  return list.join(", ");
}

type UsageTag = "ready" | "ingredient" | "raw" | "cooked" | "dry";

const USAGE_OPTIONS: Array<{ id: UsageTag; label: string }> = [
  { id: "ready", label: "מוכן" },
  { id: "ingredient", label: "חומר גלם" },
  { id: "raw", label: "גולמי" },
  { id: "cooked", label: "מבושל" },
  { id: "dry", label: "יבש" },
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
  brand: string;
  keywords: string;
  usageTags: UsageTag[];
  category: string;
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
  return {
    id: p.id,
    gtin: p.gtin ?? "",
    name: p.name ?? "",
    brand: p.brand ?? "",
    keywords: (p.keywords ?? []).join(", "),
    usageTags: tags.length ? tags : p.id.startsWith("internal:") ? ["ingredient"] : ["ready"],
    category: p.category ?? "",
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

function EditModal({
  product,
  onClose,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
}) {
  const { updateProduct, deleteProduct } = useCatalog();
  const [draft, setDraft] = useState<EditDraft | null>(product ? productToDraft(product) : null);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Keep the draft in sync with the currently edited product.
  // The modal component stays mounted, so we must update draft when `product` changes.
  useEffect(() => {
    setDraft(product ? productToDraft(product) : null);
  }, [product]);

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
        brand: d.brand.trim() || undefined,
        keywords: parseKeywords(d.keywords),
        category: d.category.trim() || undefined,
        usageTags: d.usageTags.length ? d.usageTags : undefined,
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
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3 space-y-3">
          <Field label="שם" value={draft.name} onChange={(v) => setDraft((d) => (d ? { ...d, name: v } : d))} />
          <Field label="מותג" value={draft.brand} onChange={(v) => setDraft((d) => (d ? { ...d, brand: v } : d))} />
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

          <div className="grid grid-cols-2 gap-2">
            <Field label='קלוריות ל־100g' value={draft.calories100} onChange={(v) => setDraft((d) => (d ? { ...d, calories100: v } : d))} inputMode="decimal" />
            <Field label="חלבון ל־100g" value={draft.protein100} onChange={(v) => setDraft((d) => (d ? { ...d, protein100: v } : d))} inputMode="decimal" />
            <Field label="פחמימות ל־100g" value={draft.carbs100} onChange={(v) => setDraft((d) => (d ? { ...d, carbs100: v } : d))} inputMode="decimal" />
            <Field label="שומן ל־100g" value={draft.fat100} onChange={(v) => setDraft((d) => (d ? { ...d, fat100: v } : d))} inputMode="decimal" />
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="משקל אריזה (g)" value={draft.totalWeightG} onChange={(v) => setDraft((d) => (d ? { ...d, totalWeightG: v } : d))} inputMode="decimal" />
            <Field label="יחידות באריזה" value={draft.unitsPerPack} onChange={(v) => setDraft((d) => (d ? { ...d, unitsPerPack: v } : d))} inputMode="decimal" />
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ink-muted">
            משקל יחידה מחושב: {pkg.unitWeightG ? `${fmt1(pkg.unitWeightG)}g` : "—"}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Field label="יחידות ב־100g" value={draft.unitsPer100g} onChange={(v) => setDraft((d) => (d ? { ...d, unitsPer100g: v } : d))} inputMode="decimal" />
            <Field label="כפות ב־100g" value={draft.tbspPer100g} onChange={(v) => setDraft((d) => (d ? { ...d, tbspPer100g: v } : d))} inputMode="decimal" />
            <Field label="כפיות ב־100g" value={draft.tspPer100g} onChange={(v) => setDraft((d) => (d ? { ...d, tspPer100g: v } : d))} inputMode="decimal" />
            <Field label="כוסות ב־100g" value={draft.cupsPer100g} onChange={(v) => setDraft((d) => (d ? { ...d, cupsPer100g: v } : d))} inputMode="decimal" />
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
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState<null | "csv" | "xlsx" | "pdf">(null);

  const filtered = useMemo(() => catalog.filter((p) => matchProduct(p, q)), [catalog, q]);

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
        brand: r.brand,
        keywords: r.keywords,
        category: r.category,
        usageTags: (r.usageTags as UsageTag[] | undefined) ?? undefined,
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
        {filtered.map((p) => {
          const per = p.nutrition?.per100g;
          return (
            <li key={p.id} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-semibold text-white">{p.name}</p>
                  {p.brand ? <p className="text-sm text-ink-muted">{p.brand}</p> : null}
                  <p className="mt-1 font-mono text-xs text-ink-dim" dir="ltr">
                    {p.gtin ?? p.id}
                  </p>
                  {p.usageTags?.length ? (
                    <p className="mt-1 text-[11px] text-ink-dim">שימוש: {usageCell(p.usageTags as string[])}</p>
                  ) : null}
                  {p.keywords?.length ? (
                    <p className="mt-2 text-[11px] text-ink-dim">מילים: {keywordsCell(p.keywords)}</p>
                  ) : null}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setEditing(p)}
                    className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:border-white/30"
                  >
                    עריכה
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      if (!window.confirm("למחוק מוצר מהמאגר?")) return;
                      void deleteProduct(p.id).catch(() => showToast("מחיקה נכשלה", "error"));
                    }}
                    className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition hover:border-red-400/45 hover:bg-red-500/15"
                  >
                    מחק
                  </button>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-ink-muted">קל׳ ל־100g</span>
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
            </li>
          );
        })}
      </ul>

      <EditModal product={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

