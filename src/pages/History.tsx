import { useMemo, useState } from "react";
import { EditProductModal } from "../components/EditProductModal";
import { Spinner } from "../components/Spinner";
import { useProducts } from "../context/ProductsContext";
import { useToast } from "../context/ToastContext";
import type { Product } from "../types/product";
import { downloadCsv, productsToCsv } from "../utils/csv";
import { fmt1 } from "../utils/number";
import {
  downloadProductsXlsx,
  mailtoProductsUrl,
  productsToPdfBlob,
  productsToShareSummaryText,
  productsToXlsxBlob,
  whatsAppShareUrl,
} from "../utils/productExport";
import { downloadBlob, shareBlobFile } from "../utils/share";

function IconDuplicate({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <rect x="8" y="8" width="12" height="12" rx="2" />
      <path d="M4 16V6a2 2 0 0 1 2-2h10" />
    </svg>
  );
}

function IconEdit({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5Z" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function IconTrash({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function formatSavedAt(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("he-IL", {
      dateStyle: "medium",
      timeStyle: "short",
    });
  } catch {
    return iso;
  }
}

function savedCountLabel(n: number): string {
  if (n === 0) return "";
  if (n === 1) return "מוצר אחד ברשימה.";
  return `${n} מוצרים ברשימה.`;
}

function perUnitFrom100(p: Product, v100: number | undefined): string {
  if (v100 === undefined || !Number.isFinite(v100)) return "—";
  return fmt1((v100 * p.unitWeight) / 100);
}

function ProductNutritionDetails({ p }: { p: Product }) {
  return (
    <div className="mt-3 space-y-3 border-t border-white/10 pt-3 text-sm">
      <p className="text-xs font-semibold text-ink-dim">אריזה</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-ink-muted">משקל כולל</span>
          <p className="tabular-nums text-white">{fmt1(p.totalWeight)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">יחידות באריזה</span>
          <p className="tabular-nums text-white">{p.units}</p>
        </div>
        <div className="col-span-2">
          <span className="text-ink-muted">משקל יחידה</span>
          <p className="tabular-nums text-white">{fmt1(p.unitWeight)} גרם</p>
        </div>
      </div>
      <p className="text-xs font-semibold text-ink-dim">ל-100 גרם</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-ink-muted">אנרגיה</span>
          <p className="tabular-nums text-white">{fmt1(p.cals100)} קק&quot;ל</p>
        </div>
        <div>
          <span className="text-ink-muted">חלבון</span>
          <p className="tabular-nums text-white">{fmt1(p.prot100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">פחמימות</span>
          <p className="tabular-nums text-white">{fmt1(p.carb100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">שומן</span>
          <p className="tabular-nums text-white">{fmt1(p.fat100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">סוכרים</span>
          <p className="tabular-nums text-white">
            {p.sugars100 !== undefined ? fmt1(p.sugars100) : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">שומן רווי</span>
          <p className="tabular-nums text-white">
            {p.satFat100 !== undefined ? fmt1(p.satFat100) : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">שומן טראנס</span>
          <p className="tabular-nums text-white">
            {p.transFat100 !== undefined ? fmt1(p.transFat100) : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">סיבים</span>
          <p className="tabular-nums text-white">
            {p.fiber100 !== undefined ? fmt1(p.fiber100) : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">נתרן</span>
          <p className="tabular-nums text-white">
            {p.sodiumMg100 !== undefined ? `${fmt1(p.sodiumMg100)} מ״ג` : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">כפיות סוכר (הערכה)</span>
          <p className="tabular-nums text-white">
            {p.sugarTeaspoons100 !== undefined ? fmt1(p.sugarTeaspoons100) : "—"}
          </p>
        </div>
      </div>
      <p className="text-xs font-semibold text-ink-dim">ליחידה אחת</p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-ink-muted">אנרגיה</span>
          <p className="tabular-nums text-white">{fmt1(p.calsUnit)} קק&quot;ל</p>
        </div>
        <div>
          <span className="text-ink-muted">חלבון</span>
          <p className="tabular-nums text-white">{fmt1(p.protUnit)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">פחמימות</span>
          <p className="tabular-nums text-white">{fmt1(p.carbUnit)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">שומן</span>
          <p className="tabular-nums text-white">{fmt1(p.fatUnit)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">סוכרים</span>
          <p className="tabular-nums text-white">{perUnitFrom100(p, p.sugars100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">שומן רווי</span>
          <p className="tabular-nums text-white">{perUnitFrom100(p, p.satFat100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">שומן טראנס</span>
          <p className="tabular-nums text-white">{perUnitFrom100(p, p.transFat100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">סיבים</span>
          <p className="tabular-nums text-white">{perUnitFrom100(p, p.fiber100)} גרם</p>
        </div>
        <div>
          <span className="text-ink-muted">נתרן</span>
          <p className="tabular-nums text-white">
            {p.sodiumMg100 !== undefined
              ? `${perUnitFrom100(p, p.sodiumMg100)} מ״ג`
              : "—"}
          </p>
        </div>
        <div>
          <span className="text-ink-muted">כפיות סוכר</span>
          <p className="tabular-nums text-white">
            {perUnitFrom100(p, p.sugarTeaspoons100)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function History() {
  const { showToast } = useToast();
  const {
    products,
    loading,
    error,
    hasLoaded,
    deleteProduct,
    updateProduct,
    duplicateProduct,
  } = useProducts();

  const [editing, setEditing] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [detailOpen, setDetailOpen] = useState<Record<string, boolean>>({});

  const filteredProducts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const qDigits = q.replace(/\D/g, "");
    if (!q) return products;
    return products.filter((p) => {
      if (p.name.toLowerCase().includes(q)) return true;
      if (p.brand.toLowerCase().includes(q)) return true;
      if (p.barcode) {
        const bc = p.barcode.toLowerCase().replace(/\s/g, "");
        if (bc.includes(q.replace(/\s/g, ""))) return true;
        if (qDigits.length >= 4 && bc.replace(/\D/g, "").includes(qDigits)) return true;
      }
      return false;
    });
  }, [products, searchQuery]);

  const summaryText = useMemo(() => productsToShareSummaryText(products), [products]);
  const waHref = useMemo(
    () => (products.length ? whatsAppShareUrl(summaryText) : ""),
    [products.length, summaryText],
  );
  const mailHref = useMemo(
    () =>
      products.length
        ? mailtoProductsUrl("המוצרים שלי — תקציר", summaryText)
        : "",
    [products.length, summaryText],
  );

  function exportStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function handleExportCsv() {
    const csv = productsToCsv(products);
    downloadCsv(`products-${exportStamp()}.csv`, csv);
  }

  async function handleExportXlsx() {
    await downloadProductsXlsx(products, `products-${exportStamp()}.xlsx`);
  }

  async function handleExportPdf() {
    const blob = await productsToPdfBlob(products);
    downloadBlob(blob, `products-${exportStamp()}.pdf`);
  }

  async function handleShareFile() {
    const text = summaryText;
    const stamp = exportStamp();
    const xlsxBlob = await productsToXlsxBlob(products);
    let r = await shareBlobFile({
      blob: xlsxBlob,
      filename: `products-${stamp}.xlsx`,
      mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      title: "המוצרים שלי",
      text,
    });
    if (r.ok) return;
    const pdfBlob = await productsToPdfBlob(products);
    r = await shareBlobFile({
      blob: pdfBlob,
      filename: `products-${stamp}.pdf`,
      mime: "application/pdf",
      title: "המוצרים שלי",
      text,
    });
    if (r.ok) return;
    await downloadProductsXlsx(products, `products-${stamp}.xlsx`);
    showToast("שיתוף הקובץ לא זמין — הורדנו Excel למכשיר", "success");
  }

  async function handleDelete(p: Product) {
    if (!window.confirm("האם למחוק את המוצר?")) return;
    setBusyId(p.id);
    try {
      await deleteProduct(p.id);
    } catch {
      /* toast from context */
    } finally {
      setBusyId(null);
    }
  }

  async function handleDuplicate(p: Product) {
    setBusyId(p.id);
    try {
      await duplicateProduct(p);
    } catch {
      /* toast from context */
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-4 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          המוצרים שלי
        </p>

        {loading && (
          <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
            <Spinner className="!h-5 !w-5" />
            <span>טוען מקומית…</span>
          </div>
        )}

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        {!loading && !error && hasLoaded && products.length > 0 && (
          <p className="text-sm text-ink-muted">
            {searchQuery.trim()
              ? `${filteredProducts.length} מוצרים תואמים · סה״כ ${products.length} ברשימה`
              : savedCountLabel(products.length)}
          </p>
        )}

        {hasLoaded && !loading && !error && products.length > 0 ? (
          <div className="space-y-2">
            <label htmlFor="products-search" className="sr-only">
              חיפוש מוצרים
            </label>
            <input
              id="products-search"
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="חיפוש לפי שם, מותג או ברקוד…"
              autoComplete="off"
              className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
            />
            <p className="text-[11px] text-ink-dim">
              ייצוא (Excel / PDF / שיתוף) תמיד כולל את כל המוצרים השמורים — לא רק את תוצאות החיפוש.
            </p>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <button
            type="button"
            onClick={() => void handleShareFile()}
            disabled={products.length === 0}
            className="min-h-[48px] rounded-2xl bg-white text-sm font-semibold text-black transition enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 sm:text-base"
          >
            שיתוף קובץ
          </button>
          <button
            type="button"
            onClick={() => void handleExportXlsx()}
            disabled={products.length === 0}
            className="min-h-[48px] rounded-2xl border border-white/25 bg-white/[0.06] text-sm font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:border-white/35 enabled:hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40 sm:text-base"
          >
            הורד Excel
          </button>
          <button
            type="button"
            onClick={() => void handleExportPdf()}
            disabled={products.length === 0}
            className="min-h-[48px] rounded-2xl border border-white/25 bg-white/[0.06] text-sm font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:border-white/35 enabled:hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40 sm:text-base"
          >
            הורד PDF
          </button>
          <a
            href={waHref || undefined}
            target="_blank"
            rel="noreferrer"
            aria-label="שיתוף בווטסאפ"
            title="שיתוף בווטסאפ"
            className={`flex min-h-[48px] items-center justify-center rounded-2xl border border-emerald-400/35 bg-emerald-500/15 text-emerald-100 transition hover:bg-emerald-500/25 ${products.length === 0 ? "pointer-events-none opacity-40" : ""}`}
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
            </svg>
          </a>
          <a
            href={mailHref || undefined}
            aria-label="שיתוף באימייל"
            title="שיתוף באימייל"
            className={`flex min-h-[48px] items-center justify-center rounded-2xl border border-sky-400/35 bg-sky-500/15 text-sky-100 transition hover:bg-sky-500/25 ${products.length === 0 ? "pointer-events-none opacity-40" : ""}`}
          >
            <svg
              className="h-7 w-7"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden
            >
              <rect width="20" height="16" x="2" y="4" rx="2" />
              <path d="m22 7-8.97 5.7a1.94 1.94 0 01-2.06 0L2 7" />
            </svg>
          </a>
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={products.length === 0}
            className="min-h-[48px] rounded-2xl border border-white/15 bg-transparent text-sm font-semibold text-ink-muted transition enabled:hover:border-white/25 enabled:hover:text-white disabled:cursor-not-allowed disabled:opacity-40 sm:text-base"
          >
            CSV
          </button>
        </div>
        <p className="text-xs text-ink-dim">
          שיתוף קובץ מנסה קודם Excel ואז PDF. האייקונים הירוק והתכלת שולחים תקציר טקסט — לטבלה
          מלאה השתמשו בהורדה.
        </p>
      </header>

      <ul className="space-y-3">
        {hasLoaded &&
        !loading &&
        !error &&
        products.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-ink-muted">
            אין נתונים עדיין
          </li>
        ) : null}

        {hasLoaded && !loading && !error && products.length > 0 && filteredProducts.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center text-sm text-ink-muted">
            אין תוצאות לחיפוש — נסי מילה אחרת או נקי את השדה.
          </li>
        ) : null}

        {filteredProducts.map((p) => {
          const busy = busyId === p.id;
          const detailsVisible = !!detailOpen[p.id];
          return (
            <li
              key={p.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-display text-lg font-semibold text-white md:text-xl">{p.name}</span>
                  {p.brand ? (
                    <span className="mt-0.5 block text-sm text-ink-muted">{p.brand}</span>
                  ) : null}
                  <span className="mt-1 block font-mono text-sm text-ink-muted" dir="ltr">
                    {p.barcode ?? "— ללא ברקוד —"}
                  </span>
                  <span className="mt-1 block text-xs text-ink-dim">
                    נשמר: {formatSavedAt(p.savedAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setDetailOpen((prev) => ({ ...prev, [p.id]: !prev[p.id] }))
                    }
                    className="mt-3 min-h-[44px] w-full max-w-xs rounded-xl border border-white/20 bg-white/[0.06] text-sm font-medium text-white transition hover:border-white/30 hover:bg-white/[0.09] active:scale-[0.99]"
                  >
                    {detailsVisible ? "הסתר ערכים תזונתיים" : "הצג ערכים תזונתיים"}
                  </button>
                </div>
                <div
                  className="flex h-11 min-w-[8.75rem] shrink-0 items-center justify-end self-start pt-0.5"
                  dir="ltr"
                >
                  {busy ? (
                    <div className="flex h-11 w-full items-center justify-center rounded-xl border border-white/10 bg-black/30">
                      <Spinner className="!h-5 !w-5 text-white/80" />
                    </div>
                  ) : (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/65 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]"
                        aria-label="שכפול מוצר"
                        onClick={() => void handleDuplicate(p)}
                      >
                        <IconDuplicate className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/65 transition hover:border-white/25 hover:bg-white/[0.08] hover:text-white active:scale-[0.97]"
                        aria-label="עריכת מוצר"
                        onClick={() => setEditing(p)}
                      >
                        <IconEdit className="h-5 w-5" />
                      </button>
                      <button
                        type="button"
                        className="inline-flex h-11 w-11 items-center justify-center rounded-xl border border-white/10 text-white/65 transition hover:border-red-400/40 hover:bg-red-500/10 hover:text-red-200 active:scale-[0.97]"
                        aria-label="מחיקת מוצר"
                        onClick={() => void handleDelete(p)}
                      >
                        <IconTrash className="h-5 w-5" />
                      </button>
                    </div>
                  )}
                </div>
              </div>
              {detailsVisible ? <ProductNutritionDetails p={p} /> : null}
            </li>
          );
        })}
      </ul>

      <EditProductModal
        product={editing}
        onClose={() => setEditing(null)}
        onSave={updateProduct}
      />
    </div>
  );
}
