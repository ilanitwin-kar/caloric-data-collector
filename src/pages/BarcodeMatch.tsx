import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import { useToast } from "../context/ToastContext";
import type { Verified100Item } from "../context/Verified100Context";

type ChainProduct = {
  barcode: string;
  name: string;
  brand?: string;
  weightG?: number;
  volumeMl?: number;
  qtyInPack?: number;
};

type MatchCandidate = {
  item: Verified100Item;
  score: number;
};

export function BarcodeMatch() {
  const navigate = useNavigate();
  const { catalog, upsertByBarcode } = useCatalog();
  const { items: verifiedItems, findScoredMatches } = useVerified100();
  const { showToast } = useToast();

  const [chainProducts, setChainProducts] = useState<ChainProduct[]>([]);
  const [loadingChain, setLoadingChain] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [skippedBarcodes, setSkippedBarcodes] = useState<Set<string>>(new Set());
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [filterText, setFilterText] = useState("");

  // Load chain products JSON
  useEffect(() => {
    setLoadingChain(true);
    fetch(`${import.meta.env.BASE_URL}shufersal-products.json`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ChainProduct[]>;
      })
      .then((data) => {
        setChainProducts(data);
        setLoadingChain(false);
      })
      .catch((err) => {
        setLoadError(err.message);
        setLoadingChain(false);
      });
  }, []);

  // Barcodes already in catalog
  const catalogBarcodes = useMemo(() => {
    const s = new Set<string>();
    for (const p of catalog) {
      if (p.gtin) s.add(p.gtin);
      if (p.id && !p.id.startsWith("internal:") && !p.id.startsWith("recipe:")) s.add(p.id);
    }
    return s;
  }, [catalog]);

  // Filtered queue: only products not yet in catalog and not skipped
  const queue = useMemo(() => {
    let list = chainProducts.filter(
      (p) => !catalogBarcodes.has(p.barcode) && !skippedBarcodes.has(p.barcode),
    );
    if (filterText.trim()) {
      const q = filterText.trim().toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.brand ?? "").toLowerCase().includes(q) ||
          p.barcode.includes(q),
      );
    }
    return list;
  }, [chainProducts, catalogBarcodes, skippedBarcodes, filterText]);

  const current = queue[currentIdx] ?? null;

  // Find top matches from verified DB for the current chain product
  const candidates: MatchCandidate[] = useMemo(() => {
    if (!current) return [];
    return findScoredMatches(
      { name: current.name, brand: current.brand },
      { limit: 5 },
    ).filter((m) => m.score >= 15);
  }, [current, findScoredMatches]);

  const selectedCandidate = candidates[candidateIdx] ?? null;

  // Reset candidate selection when moving to a new product
  useEffect(() => {
    setCandidateIdx(0);
  }, [currentIdx, filterText]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    setSkippedBarcodes((prev) => new Set(prev).add(current.barcode));
    setCurrentIdx(0);
  }, [current]);

  const handleConfirm = useCallback(async () => {
    if (!current || !selectedCandidate) return;
    const v = selectedCandidate.item;
    await upsertByBarcode({
      barcode: current.barcode,
      name: v.name,
      brand: v.brand,
      per100: {
        calories: v.calories100,
        proteinG: v.protein100,
        carbsG: v.carbs100,
        fatG: v.fat100,
      },
      totalWeightG: current.weightG ?? v.packWeightG,
      unitsPerPack: current.qtyInPack ?? v.unitsPerPack,
      sourceType: "verified100",
    });
    setConfirmedCount((c) => c + 1);
    setCurrentIdx(0);
    showToast(`${v.name} → ${current.barcode}`, "success");
  }, [current, selectedCandidate, upsertByBarcode, showToast]);

  // Stats
  const totalChain = chainProducts.length;
  const alreadyInCatalog = chainProducts.filter((p) => catalogBarcodes.has(p.barcode)).length;
  const remaining = queue.length;

  if (loadingChain) {
    return <p className="text-sm text-ink-muted">טוען נתוני רשת…</p>;
  }
  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-300">שגיאה בטעינת קובץ מוצרי הרשת: {loadError}</p>
        <p className="text-sm text-ink-muted">
          ודאי שהקובץ <code>public/shufersal-products.json</code> קיים.
          <br />
          הריצי: <code>node scripts/fetch-shufersal.mjs</code> ואז העתיקי ל-public/.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-5">
        <div className="flex items-center justify-between gap-3">
          <p className="font-display text-xl font-semibold tracking-tight text-white">
            שיוך ברקודים
          </p>
          <button
            type="button"
            onClick={() => navigate("/")}
            className="rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-ink-muted hover:text-white"
          >
            חזרה
          </button>
        </div>
        <div className="flex flex-wrap gap-3 text-sm text-ink-muted">
          <span>רשת: {totalChain.toLocaleString()}</span>
          <span>כבר במאגר: {alreadyInCatalog}</span>
          <span>נשאר: {remaining}</span>
          <span className="text-emerald-400">שויכו: {confirmedCount}</span>
        </div>
        <input
          type="text"
          value={filterText}
          onChange={(e) => { setFilterText(e.target.value); setCurrentIdx(0); }}
          placeholder="סנן לפי שם / מותג / ברקוד…"
          className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-ink-muted focus:border-white/30 focus:outline-none"
        />
      </header>

      {!current ? (
        <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-6 text-center">
          <p className="text-sm font-semibold text-emerald-50">
            {remaining === 0 && totalChain > 0
              ? "כל המוצרים שויכו או דולגו!"
              : "אין תוצאות לסינון הנוכחי."}
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Chain product card */}
          <section className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.07] p-4 space-y-2">
            <p className="text-sm font-semibold text-sky-50">מוצר מהרשת</p>
            <div className="space-y-1 text-sm text-sky-100/90">
              <p><span className="text-ink-muted">ברקוד:</span> {current.barcode}</p>
              <p><span className="text-ink-muted">שם:</span> {current.name}</p>
              {current.brand && <p><span className="text-ink-muted">מותג:</span> {current.brand}</p>}
              {current.weightG && <p><span className="text-ink-muted">משקל:</span> {current.weightG}g</p>}
              {current.volumeMl && <p><span className="text-ink-muted">נפח:</span> {current.volumeMl}ml</p>}
              {current.qtyInPack && <p><span className="text-ink-muted">יחידות באריזה:</span> {current.qtyInPack}</p>}
            </div>
          </section>

          {/* Verified match candidates */}
          {candidates.length === 0 ? (
            <section className="rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4">
              <p className="text-sm text-amber-100">לא נמצאה התאמה במאגר המאומת.</p>
            </section>
          ) : (
            <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-emerald-50">
                  התאמה מהמאגר המאומת ({candidateIdx + 1}/{candidates.length})
                </p>
                {candidates.length > 1 && (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      disabled={candidateIdx === 0}
                      onClick={() => setCandidateIdx((i) => i - 1)}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-sm text-white disabled:opacity-40"
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      disabled={candidateIdx === candidates.length - 1}
                      onClick={() => setCandidateIdx((i) => i + 1)}
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-sm text-white disabled:opacity-40"
                    >
                      →
                    </button>
                  </div>
                )}
              </div>
              {selectedCandidate && (
                <div className="space-y-1 text-sm text-emerald-100/90">
                  <p><span className="text-ink-muted">שם:</span> {selectedCandidate.item.name}</p>
                  {selectedCandidate.item.brand && (
                    <p><span className="text-ink-muted">מותג:</span> {selectedCandidate.item.brand}</p>
                  )}
                  {selectedCandidate.item.category && (
                    <p><span className="text-ink-muted">קטגוריה:</span> {selectedCandidate.item.category}</p>
                  )}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {selectedCandidate.item.calories100 != null && (
                      <span>🔥 {selectedCandidate.item.calories100}</span>
                    )}
                    {selectedCandidate.item.protein100 != null && (
                      <span>🥩 {selectedCandidate.item.protein100}g</span>
                    )}
                    {selectedCandidate.item.carbs100 != null && (
                      <span>🍞 {selectedCandidate.item.carbs100}g</span>
                    )}
                    {selectedCandidate.item.fat100 != null && (
                      <span>🧈 {selectedCandidate.item.fat100}g</span>
                    )}
                  </div>
                  <p className="text-ink-muted">ציון: {selectedCandidate.score}</p>
                </div>
              )}
            </section>
          )}

          {/* Action buttons */}
          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleSkip}
              className="min-h-[48px] flex-1 touch-manipulation rounded-2xl border border-white/15 bg-white/[0.06] text-sm font-semibold text-white transition hover:bg-white/[0.1] active:scale-[0.99]"
            >
              דלג
            </button>
            <button
              type="button"
              disabled={!selectedCandidate}
              onClick={() => void handleConfirm()}
              className="min-h-[48px] flex-1 touch-manipulation rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-40"
            >
              אשר ושמור למאגר
            </button>
          </div>
        </div>
      )}

      {/* Verified items without any barcode (info) */}
      {verifiedItems.length > 0 && (
        <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-ink-muted">
          מאגר מאומת: {verifiedItems.length} מוצרים
        </div>
      )}
    </div>
  );
}
