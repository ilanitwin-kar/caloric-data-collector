import { useState } from "react";
import { EditProductModal } from "../components/EditProductModal";
import { Spinner } from "../components/Spinner";
import { useProducts } from "../context/ProductsContext";
import type { Product } from "../types/product";
import { downloadCsv, productsToCsv } from "../utils/csv";
import { fmt1 } from "../utils/number";
import { shareCsv } from "../utils/share";

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

export function History() {
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

  function handleExport() {
    const csv = productsToCsv(products);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`products-${stamp}.csv`, csv);
  }

  async function handleShare() {
    const csv = productsToCsv(products);
    const stamp = new Date().toISOString().slice(0, 10);
    const res = await shareCsv({
      filename: `products-${stamp}.csv`,
      csv,
      title: "מוצרי האפליקציה",
      text: "קובץ CSV של המוצרים שנשמרו באפליקציה.",
    });
    if (!res.ok && res.reason === "unsupported") {
      handleExport();
    }
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
          <p className="text-sm text-ink-muted">{savedCountLabel(products.length)}</p>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void handleShare()}
            disabled={products.length === 0}
            className="min-h-[52px] flex-1 rounded-2xl bg-white text-lg font-semibold text-black transition enabled:active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          >
            שיתוף / שליחה
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={products.length === 0}
            className="min-h-[52px] flex-1 rounded-2xl border border-white/25 bg-white/[0.06] text-lg font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:border-white/35 enabled:hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
          >
            הורדת CSV
          </button>
        </div>
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

        {products.map((p) => {
          const busy = busyId === p.id;
          return (
            <li
              key={p.id}
              className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
            >
              <div className="flex gap-3">
                <div className="min-w-0 flex-1">
                  <span className="font-display text-xl text-white">{p.name}</span>
                  {p.brand ? (
                    <span className="mt-0.5 block text-sm text-ink-muted">{p.brand}</span>
                  ) : null}
                  <span className="mt-1 block text-xs text-ink-dim">
                    נשמר {formatSavedAt(p.savedAt)}
                  </span>
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
              <div className="mt-3 grid grid-cols-2 gap-2 border-t border-white/10 pt-3 text-sm">
                <div>
                  <span className="text-ink-muted">משקל יחידה</span>
                  <p className="tabular-nums text-white">{fmt1(p.unitWeight)} גרם</p>
                </div>
                <div>
                  <span className="text-ink-muted">קלוריות</span>
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
                <div className="col-span-2">
                  <span className="text-ink-muted">שומן</span>
                  <p className="tabular-nums text-white">{fmt1(p.fatUnit)} גרם</p>
                </div>
              </div>
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
