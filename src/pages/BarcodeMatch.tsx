import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import { useToast } from "../context/ToastContext";
import type { Verified100Item } from "../context/Verified100Context";
import { normalizeText } from "../utils/verifiedTsv";

type ChainProduct = {
  barcode: string;
  name: string;
  brand?: string;
  weightG?: number;
  volumeMl?: number;
  qtyInPack?: number;
};

type ChainCandidate = ChainProduct & { score: number };

function scoreChainMatch(chain: ChainProduct, verified: Verified100Item): number {
  const vName = normalizeText(verified.name);
  const vBrand = normalizeText(verified.brand ?? "");
  const cName = normalizeText(chain.name);
  const cBrand = normalizeText(chain.brand ?? "");

  if (!vName || !cName) return 0;
  let score = 0;

  const tokens = vName.split(" ").filter((t) => t.length >= 2);
  let hits = 0;
  for (const t of tokens) {
    if (cName.includes(t)) hits++;
  }
  score += Math.min(6, hits) * 10;

  if (cName.includes(vName) || vName.includes(cName)) score += 25;

  if (vBrand && cBrand) {
    if (cBrand === vBrand) score += 20;
    else if (cBrand.includes(vBrand) || vBrand.includes(cBrand)) score += 12;
  }

  return score;
}

const MIN_MATCH_SCORE = 35;

export function BarcodeMatch() {
  const navigate = useNavigate();
  const { catalog, upsertByBarcode } = useCatalog();
  const { items: verifiedItems } = useVerified100();
  const { showToast } = useToast();

  const [chainProducts, setChainProducts] = useState<ChainProduct[]>([]);
  const [loadingChain, setLoadingChain] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<"matched" | "unmatched">("matched");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());

  // Load chain products
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

  // Verified items: only TSV (not ministry), not already in catalog by name match
  const tsvVerifiedItems = useMemo(
    () => verifiedItems.filter((it) => !it.id.startsWith("moh:") && !it.id.startsWith("v_moh")),
    [verifiedItems],
  );

  // For each verified item, find chain candidates
  const { matched, unmatched } = useMemo(() => {
    if (!chainProducts.length || !tsvVerifiedItems.length) {
      return { matched: [] as Array<{ item: Verified100Item; candidates: ChainCandidate[] }>, unmatched: [] as Verified100Item[] };
    }

    const matchedList: Array<{ item: Verified100Item; candidates: ChainCandidate[] }> = [];
    const unmatchedList: Verified100Item[] = [];

    for (const vItem of tsvVerifiedItems) {
      // Skip if already has a barcode in catalog (matched by stable ID overlap)
      const alreadyInCatalog = catalog.some(
        (cp) =>
          cp.sources?.some((s) => s.type === "verified100") &&
          normalizeText(cp.name) === normalizeText(vItem.name) &&
          normalizeText(cp.brand ?? "") === normalizeText(vItem.brand ?? ""),
      );
      if (alreadyInCatalog) continue;

      const candidates: ChainCandidate[] = [];
      for (const cp of chainProducts) {
        if (catalogBarcodes.has(cp.barcode)) continue;
        const score = scoreChainMatch(cp, vItem);
        if (score >= MIN_MATCH_SCORE) {
          candidates.push({ ...cp, score });
        }
      }
      candidates.sort((a, b) => b.score - a.score);
      const top = candidates.slice(0, 8);

      if (top.length > 0) {
        matchedList.push({ item: vItem, candidates: top });
      } else {
        unmatchedList.push(vItem);
      }
    }

    return { matched: matchedList, unmatched: unmatchedList };
  }, [chainProducts, tsvVerifiedItems, catalog, catalogBarcodes]);

  // Active queue (without skipped)
  const queue = useMemo(
    () => (activeSection === "matched" ? matched.filter((m) => !skippedIds.has(m.item.id)) : []),
    [matched, skippedIds, activeSection],
  );

  const current = queue[currentIdx] ?? null;
  const currentCandidates = current?.candidates ?? [];
  const selectedCandidate = currentCandidates[candidateIdx] ?? null;

  useEffect(() => {
    setCandidateIdx(0);
  }, [currentIdx, activeSection]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    setSkippedIds((prev) => new Set(prev).add(current.item.id));
    setCurrentIdx(0);
  }, [current]);

  const handleConfirm = useCallback(async () => {
    if (!current || !selectedCandidate) return;
    const v = current.item;
    await upsertByBarcode({
      barcode: selectedCandidate.barcode,
      name: v.name,
      brand: v.brand,
      per100: {
        calories: v.calories100,
        proteinG: v.protein100,
        carbsG: v.carbs100,
        fatG: v.fat100,
      },
      totalWeightG: selectedCandidate.weightG ?? v.packWeightG,
      unitsPerPack: selectedCandidate.qtyInPack ?? v.unitsPerPack,
      sourceType: "verified100",
    });
    setConfirmedCount((c) => c + 1);
    setCurrentIdx(0);
    showToast(`${v.name} → ${selectedCandidate.barcode}`, "success");
  }, [current, selectedCandidate, upsertByBarcode, showToast]);

  if (loadingChain) {
    return <p className="text-sm text-ink-muted">טוען נתוני רשת…</p>;
  }
  if (loadError) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-red-300">שגיאה בטעינת קובץ מוצרי הרשת: {loadError}</p>
        <p className="text-sm text-ink-muted">
          הריצי: <code>node scripts/fetch-shufersal.mjs</code> והעתיקי ל-public/
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
          <span>מאומת (קובץ): {tsvVerifiedItems.length}</span>
          <span>יש התאמה: {matched.length}</span>
          <span>אין התאמה: {unmatched.length}</span>
          <span className="text-emerald-400">שויכו: {confirmedCount}</span>
        </div>
      </header>

      {/* Section tabs */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => { setActiveSection("matched"); setCurrentIdx(0); }}
          className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            activeSection === "matched"
              ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-50"
              : "border-white/15 bg-white/[0.04] text-ink-muted hover:text-white"
          }`}
        >
          יש התאמה ({matched.length - skippedIds.size > 0 ? matched.length - [...skippedIds].filter((id) => matched.some((m) => m.item.id === id)).length : matched.length})
        </button>
        <button
          type="button"
          onClick={() => { setActiveSection("unmatched"); setCurrentIdx(0); }}
          className={`min-h-[44px] flex-1 rounded-xl border px-3 py-2 text-sm font-semibold transition ${
            activeSection === "unmatched"
              ? "border-amber-400/40 bg-amber-500/15 text-amber-50"
              : "border-white/15 bg-white/[0.04] text-ink-muted hover:text-white"
          }`}
        >
          ללא התאמה ({unmatched.length})
        </button>
      </div>

      {/* Matched section */}
      {activeSection === "matched" && (
        <>
          {!current ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-emerald-50">
                {queue.length === 0 && matched.length > 0
                  ? "סיימת את כל ההתאמות! עברי ללשונית «ללא התאמה» לראות מה נשאר."
                  : matched.length === 0
                    ? "לא נמצאו התאמות בין המאגר המאומת לרשת."
                    : "אין עוד מוצרים."}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Verified item (source) */}
              <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.07] p-4 space-y-2">
                <p className="text-sm font-semibold text-emerald-50">המוצר שלך (מאומת)</p>
                <div className="space-y-1 text-sm text-emerald-100/90">
                  <p><span className="text-ink-muted">שם:</span> {current.item.name}</p>
                  {current.item.brand && <p><span className="text-ink-muted">מותג:</span> {current.item.brand}</p>}
                  {current.item.category && <p><span className="text-ink-muted">קטגוריה:</span> {current.item.category}</p>}
                  <div className="flex flex-wrap gap-3 pt-1">
                    {current.item.calories100 != null && <span>🔥 {current.item.calories100}</span>}
                    {current.item.protein100 != null && <span>🥩 {current.item.protein100}g</span>}
                    {current.item.carbs100 != null && <span>🍞 {current.item.carbs100}g</span>}
                    {current.item.fat100 != null && <span>🧈 {current.item.fat100}g</span>}
                  </div>
                </div>
              </section>

              {/* Chain candidates */}
              <section className="rounded-2xl border border-sky-400/25 bg-sky-500/[0.07] p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-sky-50">
                    ברקוד מהרשת ({candidateIdx + 1}/{currentCandidates.length})
                  </p>
                  {currentCandidates.length > 1 && (
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
                        disabled={candidateIdx === currentCandidates.length - 1}
                        onClick={() => setCandidateIdx((i) => i + 1)}
                        className="rounded-lg border border-white/15 bg-white/[0.06] px-2.5 py-1 text-sm text-white disabled:opacity-40"
                      >
                        →
                      </button>
                    </div>
                  )}
                </div>
                {selectedCandidate && (
                  <div className="space-y-1 text-sm text-sky-100/90">
                    <p><span className="text-ink-muted">ברקוד:</span> <span dir="ltr">{selectedCandidate.barcode}</span></p>
                    <p><span className="text-ink-muted">שם:</span> {selectedCandidate.name}</p>
                    {selectedCandidate.brand && <p><span className="text-ink-muted">מותג:</span> {selectedCandidate.brand}</p>}
                    {selectedCandidate.weightG && <p><span className="text-ink-muted">משקל:</span> {selectedCandidate.weightG}g</p>}
                    {selectedCandidate.volumeMl && <p><span className="text-ink-muted">נפח:</span> {selectedCandidate.volumeMl}ml</p>}
                    <p className="text-ink-muted">ציון: {selectedCandidate.score}</p>
                  </div>
                )}
              </section>

              {/* Actions */}
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
                  onClick={() => void handleConfirm()}
                  className="min-h-[48px] flex-1 touch-manipulation rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99]"
                >
                  אשר ושמור למאגר
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Unmatched section */}
      {activeSection === "unmatched" && (
        <div className="space-y-3">
          {unmatched.length === 0 ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-6 text-center">
              <p className="text-sm text-amber-100">כל המוצרים מהמאגר נמצאו ברשת!</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                {unmatched.length} מוצרים מהמאגר המאומת שלא נמצא להם ברקוד בשופרסל.
                כשתטעני רשת נוספת (רמי לוי, אושר עד...) — ניתן יהיה לחפש אותם שם.
              </p>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                {unmatched.map((v) => (
                  <div key={v.id} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
                    <p className="text-sm text-white">{v.name}</p>
                    {v.brand && <p className="text-sm text-ink-muted">{v.brand}</p>}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
