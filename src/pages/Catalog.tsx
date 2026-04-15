import { useMemo, useRef, useState } from "react";
import { useCatalog, type CatalogProduct } from "../context/CatalogContext";
import { Spinner } from "../components/Spinner";
import { normalizeBarcode } from "../utils/openFoodFacts";
import { parseNum } from "../utils/number";
import { catalogToCsv, parseCatalogCsv } from "../utils/catalogCsv";
import { downloadCsv } from "../utils/csv";
import { useVerified100 } from "../context/Verified100Context";

function fmt(n?: number, maxFrac = 1): string {
  if (typeof n !== "number" || !Number.isFinite(n)) return "—";
  return n.toLocaleString("he-IL", { maximumFractionDigits: maxFrac });
}

function matchProduct(p: CatalogProduct, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  const code = normalizeBarcode(s);
  if (code.length >= 6) return p.gtin.includes(code);
  const hay = `${p.name} ${p.brand ?? ""}`.toLowerCase();
  return hay.includes(s);
}

type EditDraft = {
  gtin: string;
  name: string;
  brand: string;
  totalWeightG: string;
  unitsPerPack: string;
  calories100: string;
  protein100: string;
  carbs100: string;
  sugars100: string;
  fat100: string;
  satFat100: string;
  fiber100: string;
  sodiumMg100: string;
  ingredientsText: string;
  allergensText: string;
  categoriesText: string;
};

function productToDraft(p: CatalogProduct): EditDraft {
  return {
    gtin: p.gtin,
    name: p.name ?? "",
    brand: p.brand ?? "",
    totalWeightG:
      p.package?.totalWeightG != null ? String(p.package.totalWeightG) : "",
    unitsPerPack:
      p.package?.unitsPerPack != null ? String(p.package.unitsPerPack) : "",
    calories100:
      p.nutrition?.per100g?.calories != null
        ? String(p.nutrition.per100g.calories)
        : "",
    protein100:
      p.nutrition?.per100g?.proteinG != null
        ? String(p.nutrition.per100g.proteinG)
        : "",
    carbs100:
      p.nutrition?.per100g?.carbsG != null
        ? String(p.nutrition.per100g.carbsG)
        : "",
    sugars100:
      p.nutrition?.per100g?.sugarsG != null
        ? String(p.nutrition.per100g.sugarsG)
        : "",
    fat100:
      p.nutrition?.per100g?.fatG != null
        ? String(p.nutrition.per100g.fatG)
        : "",
    satFat100:
      p.nutrition?.per100g?.satFatG != null
        ? String(p.nutrition.per100g.satFatG)
        : "",
    fiber100:
      p.nutrition?.per100g?.fiberG != null
        ? String(p.nutrition.per100g.fiberG)
        : "",
    sodiumMg100:
      p.nutrition?.per100g?.sodiumMg != null
        ? String(p.nutrition.per100g.sodiumMg)
        : "",
    ingredientsText: p.ingredientsText ?? "",
    allergensText: p.allergensText ?? "",
    categoriesText: p.categoriesText ?? "",
  };
}

function computePerUnitFromDraft(d: EditDraft) {
  const tw = parseNum(d.totalWeightG);
  const u = parseNum(d.unitsPerPack);
  if (!(tw > 0) || !(u > 0)) return { unitWeightG: undefined, factor: undefined };
  const unitWeightG = tw / u;
  const factor = unitWeightG / 100;
  return { unitWeightG, factor };
}

function Field({
  label,
  value,
  onChange,
  inputMode,
  placeholder,
  textarea,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric";
  placeholder?: string;
  textarea?: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-medium text-ink-muted">{label}</label>
      {textarea ? (
        <textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="min-h-[96px] w-full resize-y rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
        />
      ) : (
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode={inputMode}
          placeholder={placeholder}
          autoComplete="off"
          className="min-h-[48px] w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
        />
      )}
    </div>
  );
}

function EditCatalogModal({
  product,
  onClose,
}: {
  product: CatalogProduct | null;
  onClose: () => void;
}) {
  const { updateProduct, deleteProduct } = useCatalog();
  const [draft, setDraft] = useState<EditDraft | null>(
    product ? productToDraft(product) : null,
  );
  const [saving, setSaving] = useState(false);
  const [busyDelete, setBusyDelete] = useState(false);

  if (!product || !draft) return null;

  const { unitWeightG, factor } = computePerUnitFromDraft(draft);
  const c100 = parseNum(draft.calories100);
  const p100 = parseNum(draft.protein100);
  const cb100 = parseNum(draft.carbs100);
  const sug100 = parseNum(draft.sugars100);
  const f100 = parseNum(draft.fat100);
  const sat100 = parseNum(draft.satFat100);
  const fib100 = parseNum(draft.fiber100);
  const sod100 = parseNum(draft.sodiumMg100);

  const cUnit = factor && Number.isFinite(c100) ? c100 * factor : undefined;
  const pUnit = factor && Number.isFinite(p100) ? p100 * factor : undefined;
  const cbUnit = factor && Number.isFinite(cb100) ? cb100 * factor : undefined;
  const sugUnit =
    factor && Number.isFinite(sug100) ? sug100 * factor : undefined;
  const fUnit = factor && Number.isFinite(f100) ? f100 * factor : undefined;
  const satUnit =
    factor && Number.isFinite(sat100) ? sat100 * factor : undefined;
  const fibUnit =
    factor && Number.isFinite(fib100) ? fib100 * factor : undefined;
  const sodUnit =
    factor && Number.isFinite(sod100) ? sod100 * factor : undefined;

  async function handleSave() {
    const d = draft;
    const p = product;
    if (!d || !p) return;

    const name = d.name.trim();
    if (!name) return;

    const tw = parseNum(d.totalWeightG);
    const u = parseNum(d.unitsPerPack);
    const totalWeightG = tw > 0 ? tw : undefined;
    const unitsPerPack = u > 0 ? u : undefined;
    const unitWeightNext =
      totalWeightG !== undefined && unitsPerPack !== undefined
        ? totalWeightG / unitsPerPack
        : undefined;
    const factorNext = unitWeightNext ? unitWeightNext / 100 : undefined;

    const next: CatalogProduct = {
      ...p,
      name,
      brand: d.brand.trim() || undefined,
      package: {
        ...p.package,
        totalWeightG,
        unitsPerPack,
        unitWeightG: unitWeightNext,
      },
      nutrition: {
        per100g: {
          calories: Number.isFinite(c100) ? c100 : undefined,
          proteinG: Number.isFinite(p100) ? p100 : undefined,
          carbsG: Number.isFinite(cb100) ? cb100 : undefined,
          sugarsG: Number.isFinite(sug100) ? sug100 : undefined,
          fatG: Number.isFinite(f100) ? f100 : undefined,
          satFatG: Number.isFinite(sat100) ? sat100 : undefined,
          fiberG: Number.isFinite(fib100) ? fib100 : undefined,
          sodiumMg: Number.isFinite(sod100) ? sod100 : undefined,
        },
        perUnit: {
          calories:
            factorNext && Number.isFinite(c100) ? c100 * factorNext : undefined,
          proteinG:
            factorNext && Number.isFinite(p100) ? p100 * factorNext : undefined,
          carbsG:
            factorNext && Number.isFinite(cb100)
              ? cb100 * factorNext
              : undefined,
          sugarsG:
            factorNext && Number.isFinite(sug100)
              ? sug100 * factorNext
              : undefined,
          fatG:
            factorNext && Number.isFinite(f100) ? f100 * factorNext : undefined,
          satFatG:
            factorNext && Number.isFinite(sat100)
              ? sat100 * factorNext
              : undefined,
          fiberG:
            factorNext && Number.isFinite(fib100)
              ? fib100 * factorNext
              : undefined,
          sodiumMg:
            factorNext && Number.isFinite(sod100)
              ? sod100 * factorNext
              : undefined,
        },
      },
      ingredientsText: d.ingredientsText.trim() || undefined,
      allergensText: d.allergensText.trim() || undefined,
      categoriesText: d.categoriesText.trim() || undefined,
    };

    setSaving(true);
    try {
      await updateProduct(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!window.confirm("למחוק מהקטלוג?")) return;
    const p = product;
    if (!p) return;
    setBusyDelete(true);
    try {
      await deleteProduct(p.gtin);
      onClose();
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div
        className="relative z-10 mx-4 mb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-lg rounded-2xl border border-white/15 bg-neutral-950 p-5 shadow-2xl sm:mb-0"
        dir="rtl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-semibold text-white">
              עריכת מוצר בקטלוג
            </h2>
            <p className="mt-1 text-xs text-ink-dim" dir="ltr">
              {product.gtin}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={busyDelete}
            className="rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200 transition disabled:opacity-50"
          >
            {busyDelete ? "מוחק…" : "מחיקה"}
          </button>
        </div>

        <div className="mt-4 max-h-[min(72vh,620px)] space-y-3 overflow-y-auto pr-1">
          <Field
            label="שם המוצר"
            value={draft.name}
            onChange={(v) => setDraft({ ...draft, name: v })}
          />
          <Field
            label="מותג"
            value={draft.brand}
            onChange={(v) => setDraft({ ...draft, brand: v })}
          />

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="משקל כולל (גרם)"
              value={draft.totalWeightG}
              onChange={(v) => setDraft({ ...draft, totalWeightG: v })}
              inputMode="decimal"
            />
            <Field
              label="מספר יחידות"
              value={draft.unitsPerPack}
              onChange={(v) => setDraft({ ...draft, unitsPerPack: v })}
              inputMode="numeric"
            />
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
            <p className="text-xs font-semibold text-ink-dim">
              חישוב אוטומטי ליחידה
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-ink-muted">משקל יחידה</span>
                <p className="mt-0.5 tabular-nums text-white">
                  {fmt(unitWeightG, 1)} גרם
                </p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-ink-muted">קלוריות ליחידה</span>
                <p className="mt-0.5 tabular-nums text-white">{fmt(cUnit, 1)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-ink-muted">חלבון ליחידה</span>
                <p className="mt-0.5 tabular-nums text-white">{fmt(pUnit, 1)}</p>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-ink-muted">פחמימות ליחידה</span>
                <p className="mt-0.5 tabular-nums text-white">{fmt(cbUnit, 1)}</p>
              </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-ink-muted">סוכרים ליחידה</span>
              <p className="mt-0.5 tabular-nums text-white">{fmt(sugUnit, 1)}</p>
            </div>
              <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                <span className="text-ink-muted">שומן ליחידה</span>
                <p className="mt-0.5 tabular-nums text-white">{fmt(fUnit, 1)}</p>
              </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-ink-muted">שומן רווי ליחידה</span>
              <p className="mt-0.5 tabular-nums text-white">{fmt(satUnit, 1)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-ink-muted">סיבים ליחידה</span>
              <p className="mt-0.5 tabular-nums text-white">{fmt(fibUnit, 1)}</p>
            </div>
            <div className="col-span-2 rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <span className="text-ink-muted">נתרן ליחידה (מ״ג)</span>
              <p className="mt-0.5 tabular-nums text-white">{fmt(sodUnit, 0)}</p>
            </div>
            </div>
            <p className="mt-2 text-[11px] text-ink-dim">
              מילוי משקל כולל + מספר יחידות מספיק כדי לחשב ליחידה מתוך ערכי 100 גרם.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field
              label="קלוריות (ל־100 גרם)"
              value={draft.calories100}
              onChange={(v) => setDraft({ ...draft, calories100: v })}
              inputMode="decimal"
            />
            <Field
              label="חלבון (ל־100 גרם)"
              value={draft.protein100}
              onChange={(v) => setDraft({ ...draft, protein100: v })}
              inputMode="decimal"
            />
            <Field
              label="פחמימות (ל־100 גרם)"
              value={draft.carbs100}
              onChange={(v) => setDraft({ ...draft, carbs100: v })}
              inputMode="decimal"
            />
            <Field
              label="סוכרים (ל־100 גרם)"
              value={draft.sugars100}
              onChange={(v) => setDraft({ ...draft, sugars100: v })}
              inputMode="decimal"
            />
            <Field
              label="שומן (ל־100 גרם)"
              value={draft.fat100}
              onChange={(v) => setDraft({ ...draft, fat100: v })}
              inputMode="decimal"
            />
            <Field
              label="שומן רווי (ל־100 גרם)"
              value={draft.satFat100}
              onChange={(v) => setDraft({ ...draft, satFat100: v })}
              inputMode="decimal"
            />
            <Field
              label="סיבים (ל־100 גרם)"
              value={draft.fiber100}
              onChange={(v) => setDraft({ ...draft, fiber100: v })}
              inputMode="decimal"
            />
            <Field
              label="נתרן (מ״ג ל־100 גרם)"
              value={draft.sodiumMg100}
              onChange={(v) => setDraft({ ...draft, sodiumMg100: v })}
              inputMode="decimal"
            />
          </div>

          <Field
            label="רכיבים (טקסט)"
            value={draft.ingredientsText}
            onChange={(v) => setDraft({ ...draft, ingredientsText: v })}
            textarea
          />
          <Field
            label="אלרגנים (טקסט)"
            value={draft.allergensText}
            onChange={(v) => setDraft({ ...draft, allergensText: v })}
            textarea
          />
          <Field
            label="קטגוריות (טקסט)"
            value={draft.categoriesText}
            onChange={(v) => setDraft({ ...draft, categoriesText: v })}
            textarea
          />

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-xl border border-white/20 text-sm font-medium text-ink-muted transition hover:border-white/30 hover:text-white"
            >
              ביטול
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="min-h-[48px] flex-1 rounded-xl bg-white text-sm font-semibold text-black transition enabled:active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמירה"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Catalog() {
  const { catalog, loading, error, bulkUpsert } = useCatalog();
  const { items: verifiedItems, importTsv, loading: verifiedLoading } = useVerified100();
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState<CatalogProduct | null>(null);
  const [importing, setImporting] = useState(false);
  const [importingVerified, setImportingVerified] = useState(false);
  const [importProgress, setImportProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const verifiedFileRef = useRef<HTMLInputElement | null>(null);
  const [verifiedFileName, setVerifiedFileName] = useState<string | null>(null);

  const filtered = useMemo(
    () => catalog.filter((p) => matchProduct(p, q)),
    [catalog, q],
  );

  async function handleImportFile(file: File) {
    const text = await file.text();
    const rows = parseCatalogCsv(text);
    if (rows.length === 0) return;
    setImporting(true);
    setImportProgress({ done: 0, total: rows.length });
    try {
      const nowIso = new Date().toISOString();
      const products: CatalogProduct[] = rows.map((row) => {
        const totalW = row.totalWeightG && row.totalWeightG > 0 ? row.totalWeightG : undefined;
        const units = row.unitsPerPack && row.unitsPerPack > 0 ? row.unitsPerPack : undefined;
        const unitWeightG = totalW !== undefined && units !== undefined ? totalW / units : undefined;
        const factor = unitWeightG ? unitWeightG / 100 : undefined;
        const mul = (x?: number) =>
          factor && typeof x === "number" && Number.isFinite(x) ? x * factor : undefined;

        const product: CatalogProduct = {
          gtin: row.gtin,
          name: row.name,
          brand: row.brand,
          createdAt: nowIso,
          updatedAt: nowIso,
          package: { totalWeightG: totalW, unitsPerPack: units, unitWeightG },
          nutrition: {
            per100g: {
              calories: row.calories100,
              proteinG: row.protein100,
              carbsG: row.carbs100,
              sugarsG: row.sugars100,
              fatG: row.fat100,
              satFatG: row.satFat100,
              fiberG: row.fiber100,
              sodiumMg: row.sodiumMg100,
            },
            perUnit: {
              calories: mul(row.calories100),
              proteinG: mul(row.protein100),
              carbsG: mul(row.carbs100),
              sugarsG: mul(row.sugars100),
              fatG: mul(row.fat100),
              satFatG: mul(row.satFat100),
              fiberG: mul(row.fiber100),
              sodiumMg: mul(row.sodiumMg100),
            },
          },
          ingredientsText: row.ingredientsText,
          allergensText: row.allergensText,
          categoriesText: row.categoriesText,
          sources: [{ type: "manual", at: nowIso }],
        };

        return product;
      });

      await bulkUpsert(products, {
        chunkSize: 250,
        onProgress: (done, total) => setImportProgress({ done, total }),
      });
    } finally {
      setImporting(false);
      setTimeout(() => setImportProgress(null), 800);
    }
  }

  return (
    <div className="space-y-6 pb-4" dir="rtl">
      <header className="space-y-4 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          קטלוג מוצרים
        </p>
        <p className="text-sm text-ink-muted">
          מאגר פרטי לפי ברקוד. חפשי לפי שם/מותג או הדביקי ברקוד.
        </p>

        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="חיפוש… (שם / מותג / ברקוד)"
          className="min-h-[52px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-lg text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
          inputMode="search"
        />

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => {
              const csv = catalogToCsv(catalog);
              const stamp = new Date().toISOString().slice(0, 10);
              downloadCsv(`catalog-${stamp}.csv`, csv);
            }}
            className="min-h-[48px] flex-1 rounded-2xl border border-white/25 bg-white/[0.06] text-sm font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:border-white/35 enabled:hover:bg-white/[0.09] disabled:opacity-40"
            disabled={catalog.length === 0}
          >
            ייצוא CSV
          </button>

          <label className="min-h-[48px] flex-1 cursor-pointer rounded-2xl border border-white/25 bg-white/[0.06] px-4 py-3 text-center text-sm font-semibold text-white transition hover:border-white/35 hover:bg-white/[0.09]">
            {importing
              ? importProgress
                ? `מייבא… ${importProgress.done.toLocaleString("he-IL")}/${importProgress.total.toLocaleString("he-IL")}`
                : "מייבא…"
              : "ייבוא CSV"}
            <input
              type="file"
              accept=".csv,text/csv"
              className="sr-only"
              disabled={importing}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = "";
                if (!f) return;
                void handleImportFile(f);
              }}
            />
          </label>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">מאגר מאומת (100g)</p>
              <p className="mt-0.5 text-xs text-ink-muted">
                {verifiedLoading
                  ? "טוען…"
                  : `${verifiedItems.length.toLocaleString("he-IL")} פריטים מאומתים זמינים`}
              </p>
              {verifiedFileName ? (
                <p className="mt-1 text-[11px] text-ink-dim" dir="ltr">
                  {verifiedFileName}
                </p>
              ) : null}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={importingVerified}
                onClick={() => verifiedFileRef.current?.click()}
                className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50 hover:border-white/30 hover:bg-white/[0.09]"
              >
                {importingVerified ? "מייבא…" : "ייבוא מאגר (TSV/CSV)"}
              </button>
              <input
                ref={verifiedFileRef}
                type="file"
                accept=".tsv,.csv,text/csv,text/tab-separated-values,text/plain"
                className="sr-only"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  e.target.value = "";
                  if (!f) return;
                  setVerifiedFileName(f.name);
                  setImportingVerified(true);
                  void importTsv(f).finally(() => setImportingVerified(false));
                }}
              />
            </div>
          </div>
          <p className="mt-2 text-[11px] text-ink-dim">
            המאגר המאומת משמש למילוי אוטומטי של ערכי 100g בזמן סריקה/הקלדה, גם בלי ברקוד.
          </p>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="!h-5 !w-5" />
            טוען מהענן…
          </div>
        ) : null}
        {error ? <p className="text-sm text-red-300">{error}</p> : null}
      </header>

      <ul className="space-y-3">
        {!loading && !error && filtered.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-ink-muted">
            אין התאמות
          </li>
        ) : null}

        {filtered.map((p) => {
          const per100 = p.nutrition?.per100g;
          const perUnit = p.nutrition?.perUnit;
          return (
            <li
              key={p.gtin}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <button
                type="button"
                onClick={() => setEditing(p)}
                className="w-full text-right"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-xl text-white">{p.name}</p>
                    {p.brand ? (
                      <p className="mt-0.5 text-sm text-ink-muted">{p.brand}</p>
                    ) : null}
                    <p className="mt-1 text-xs text-ink-dim" dir="ltr">
                      {p.gtin}
                    </p>
                  </div>
                  <span className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-[11px] font-semibold text-ink-muted">
                    עריכה
                  </span>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm">
                  <div>
                    <span className="text-ink-muted">קלוריות ל־100g</span>
                    <p className="tabular-nums text-white">
                      {fmt(per100?.calories, 0)}
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-muted">קלוריות ליחידה</span>
                    <p className="tabular-nums text-white">
                      {fmt(perUnit?.calories, 0)}
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-muted">חלבון ליחידה</span>
                    <p className="tabular-nums text-white">
                      {fmt(perUnit?.proteinG, 1)}
                    </p>
                  </div>
                  <div>
                    <span className="text-ink-muted">פחמימות ליחידה</span>
                    <p className="tabular-nums text-white">
                      {fmt(perUnit?.carbsG, 1)}
                    </p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-ink-muted">שומן ליחידה</span>
                    <p className="tabular-nums text-white">
                      {fmt(perUnit?.fatG, 1)}
                    </p>
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>

      <EditCatalogModal
        product={editing}
        onClose={() => setEditing(null)}
      />
    </div>
  );
}

