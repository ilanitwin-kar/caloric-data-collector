import { Spinner } from "../components/Spinner";
import { useProducts } from "../context/ProductsContext";
import { downloadCsv, productsToCsv } from "../utils/csv";
import { fmt1 } from "../utils/number";

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
  const { products, loading, error, hasLoaded, loadProducts } = useProducts();

  function handleExport() {
    const csv = productsToCsv(products);
    const stamp = new Date().toISOString().slice(0, 10);
    downloadCsv(`caloric-intelligence-${stamp}.csv`, csv);
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-4 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          היסטוריה
        </p>

        {loading && (
          <div className="flex items-center gap-2 text-sm text-ink-muted">
            <Spinner className="!h-5 !w-5" />
            טוען מהענן…
          </div>
        )}

        {error && <p className="text-sm text-red-300">{error}</p>}

        {!loading && !error && hasLoaded && products.length > 0 && (
          <p className="text-sm text-ink-muted">{savedCountLabel(products.length)}</p>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => void loadProducts()}
            disabled={loading}
            className="min-h-[52px] w-full rounded-2xl bg-white px-4 text-lg font-semibold text-black shadow-lg shadow-white/10 transition enabled:active:scale-[0.99] enabled:hover:bg-neutral-200 disabled:cursor-not-allowed disabled:opacity-50"
          >
            טען נתונים מהענן
          </button>
          <button
            type="button"
            onClick={handleExport}
            disabled={products.length === 0 || loading}
            className="min-h-[52px] w-full rounded-2xl border border-white/25 bg-white/[0.06] text-lg font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:border-white/35 enabled:hover:bg-white/[0.09] disabled:cursor-not-allowed disabled:opacity-40"
          >
            ייצוא ל-CSV
          </button>
        </div>
      </header>

      <ul className="space-y-3">
        {!hasLoaded && !loading && !error ? (
          <li className="rounded-2xl border border-dashed border-white/15 bg-white/[0.02] px-4 py-12 text-center text-sm leading-relaxed text-ink-muted">
            הנתונים לא נטענים אוטומטית. לחצו על «טען נתונים מהענן» למעלה כדי
            להציג את הרשימה.
          </li>
        ) : null}

        {hasLoaded && !loading && !error && products.length === 0 ? (
          <li className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-12 text-center text-sm text-ink-muted">
            אין נתונים עדיין
          </li>
        ) : null}

        {products.map((p) => (
          <li
            key={p.id}
            className="rounded-2xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex flex-col gap-1">
              <span className="font-display text-xl text-white">{p.name}</span>
              {p.brand ? (
                <span className="text-sm text-ink-muted">{p.brand}</span>
              ) : null}
              <span className="text-xs text-ink-dim">
                נשמר {formatSavedAt(p.savedAt)}
              </span>
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
        ))}
      </ul>
    </div>
  );
}
