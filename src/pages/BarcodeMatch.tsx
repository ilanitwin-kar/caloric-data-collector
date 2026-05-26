import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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

// --- Dice coefficient (bigram similarity) for fuzzy matching ---
function bigrams(s: string): Set<string> {
  const bg = new Set<string>();
  for (let i = 0; i < s.length - 1; i++) bg.add(s.slice(i, i + 2));
  return bg;
}

function diceCoefficient(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const aB = bigrams(a);
  const bB = bigrams(b);
  let overlap = 0;
  for (const bg of aB) if (bB.has(bg)) overlap++;
  return (2 * overlap) / (aB.size + bB.size);
}

function fuzzyTokenMatch(token: string, text: string): boolean {
  if (text.includes(token)) return true;
  const words = text.split(" ");
  for (const w of words) {
    if (w.length < 2) continue;
    if (diceCoefficient(token, w) >= 0.6) return true;
  }
  return false;
}

// --- Extract weight/volume from product name ---
const WEIGHT_RE = /(\d+(?:[.,]\d+)?)\s*(?:גרם|גר|ג'|ג)/i;
const VOLUME_RE = /(\d+(?:[.,]\d+)?)\s*(?:מ"ל|מיליליטר|מל|ליטר|לי)/i;

function extractWeightFromName(name: string): number | undefined {
  const m = name.match(WEIGHT_RE);
  return m ? parseFloat(m[1].replace(",", ".")) : undefined;
}

function extractVolumeFromName(name: string): number | undefined {
  const m = name.match(VOLUME_RE);
  if (!m) return undefined;
  const val = parseFloat(m[1].replace(",", "."));
  if (/ליטר/i.test(name) && val <= 20) return val * 1000;
  return val;
}

// --- Scoring ---
function scoreChainMatch(chain: ChainProduct, verified: Verified100Item): number {
  const vName = normalizeText(verified.name);
  const vBrand = normalizeText(verified.brand ?? "");
  const cName = normalizeText(chain.name);
  const cBrand = normalizeText(chain.brand ?? "");

  if (!vName || !cName) return 0;
  let score = 0;

  // Fuzzy token matching
  const tokens = vName.split(" ").filter((t) => t.length >= 2);
  let hits = 0;
  for (const t of tokens) {
    if (fuzzyTokenMatch(t, cName)) hits++;
  }
  score += Math.min(6, hits) * 10;

  // Full-name Dice similarity bonus
  const fullDice = diceCoefficient(vName, cName);
  if (fullDice >= 0.7) score += 20;
  else if (fullDice >= 0.5) score += 10;

  // Substring containment
  if (cName.includes(vName) || vName.includes(cName)) score += 25;

  // Brand matching (also fuzzy)
  if (vBrand && cBrand) {
    if (cBrand === vBrand) score += 20;
    else if (cBrand.includes(vBrand) || vBrand.includes(cBrand)) score += 12;
    else if (diceCoefficient(vBrand, cBrand) >= 0.6) score += 10;
  }

  // Soft weight/volume bonus/penalty
  const vWeight = verified.packWeightG ?? extractWeightFromName(verified.name);
  const cWeight = chain.weightG ?? extractWeightFromName(chain.name);
  const vVolume = extractVolumeFromName(verified.name);
  const cVolume = chain.volumeMl ?? extractVolumeFromName(chain.name);

  if (vWeight && cWeight) {
    if (Math.abs(vWeight - cWeight) < 5) score += 12;
    else if (Math.abs(vWeight - cWeight) > 100) score -= 8;
  } else if (vVolume && cVolume) {
    if (Math.abs(vVolume - cVolume) < 20) score += 12;
    else if (Math.abs(vVolume - cVolume) > 200) score -= 8;
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
  const [searchText, setSearchText] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Load chain products (cache: no-store bypasses service worker cache)
  useEffect(() => {
    let cancelled = false;
    setLoadingChain(true);
    fetch(`${import.meta.env.BASE_URL}shufersal-products.json`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<ChainProduct[]>;
      })
      .then((data) => {
        if (cancelled) return;
        if (!Array.isArray(data) || data.length === 0) throw new Error("קובץ ריק או לא תקין");
        setChainProducts(data);
        setLoadingChain(false);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err.message);
        setLoadingChain(false);
      });
    return () => { cancelled = true; };
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

  // Verified items: only TSV (not ministry)
  const tsvVerifiedItems = useMemo(
    () => verifiedItems.filter((it) => !it.id.startsWith("moh:") && !it.id.startsWith("v_moh")),
    [verifiedItems],
  );

  // For each verified item, find chain candidates (chunked to avoid blocking UI)
  const [matched, setMatched] = useState<Array<{ item: Verified100Item; candidates: ChainCandidate[] }>>([]);
  const [unmatched, setUnmatched] = useState<Verified100Item[]>([]);
  const [computing, setComputing] = useState(false);

  useEffect(() => {
    if (!chainProducts.length || !tsvVerifiedItems.length) {
      setMatched([]);
      setUnmatched([]);
      return;
    }

    setComputing(true);
    let cancelled = false;

    const CHUNK = 10;
    const matchedList: Array<{ item: Verified100Item; candidates: ChainCandidate[] }> = [];
    const unmatchedList: Verified100Item[] = [];
    let i = 0;

    function processChunk() {
      if (cancelled) return;
      const end = Math.min(i + CHUNK, tsvVerifiedItems.length);

      for (; i < end; i++) {
        const vItem = tsvVerifiedItems[i];
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

      if (i < tsvVerifiedItems.length) {
        setTimeout(processChunk, 0);
      } else {
        if (!cancelled) {
          setMatched(matchedList);
          setUnmatched(unmatchedList);
          setComputing(false);
        }
      }
    }

    setTimeout(processChunk, 30);
    return () => { cancelled = true; };
  }, [chainProducts, tsvVerifiedItems, catalog, catalogBarcodes]);

  // Skipped items move to unmatched conceptually
  const displayMatched = useMemo(
    () => matched.filter((m) => !skippedIds.has(m.item.id)),
    [matched, skippedIds],
  );
  const displayUnmatched = useMemo(
    () => [
      ...unmatched,
      ...matched.filter((m) => skippedIds.has(m.item.id)).map((m) => m.item),
    ],
    [unmatched, matched, skippedIds],
  );

  // Active queue
  const queue = activeSection === "matched" ? displayMatched : [];
  const current = queue[currentIdx] ?? null;
  const currentCandidates = current?.candidates ?? [];
  const selectedCandidate = currentCandidates[candidateIdx] ?? null;

  // Manual search within chain products for current verified item
  const searchResults = useMemo(() => {
    if (!searchText.trim() || !current) return [];
    const q = normalizeText(searchText);
    return chainProducts
      .filter((cp) => {
        if (catalogBarcodes.has(cp.barcode)) return false;
        const n = normalizeText(cp.name);
        const b = normalizeText(cp.brand ?? "");
        return n.includes(q) || b.includes(q) || cp.barcode.includes(searchText.trim());
      })
      .slice(0, 10)
      .map((cp) => ({ ...cp, score: scoreChainMatch(cp, current.item) }));
  }, [searchText, current, chainProducts, catalogBarcodes]);

  useEffect(() => {
    setCandidateIdx(0);
    setSearchText("");
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

  const handlePickSearch = useCallback(
    (cp: ChainProduct & { score: number }) => {
      if (!current) return;
      const existing = currentCandidates.findIndex((c) => c.barcode === cp.barcode);
      if (existing >= 0) {
        setCandidateIdx(existing);
      } else {
        currentCandidates.unshift(cp);
        setCandidateIdx(0);
      }
      setSearchText("");
    },
    [current, currentCandidates],
  );

  // Keyboard shortcuts
  useEffect(() => {
    if (activeSection !== "matched" || !current) return;
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        if (selectedCandidate) void handleConfirm();
      } else if (e.key === "Escape") {
        e.preventDefault();
        handleSkip();
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        setCandidateIdx((i) => Math.min(currentCandidates.length - 1, i + 1));
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        setCandidateIdx((i) => Math.max(0, i - 1));
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [activeSection, current, selectedCandidate, handleConfirm, handleSkip, currentCandidates.length]);

  if (loadingChain || computing) {
    return <p className="text-sm text-ink-muted">{loadingChain ? "טוען נתוני רשת…" : "מחשב התאמות…"}</p>;
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
          <span>יש התאמה: {displayMatched.length}</span>
          <span>ללא התאמה: {displayUnmatched.length}</span>
          <span className="text-emerald-400">שויכו: {confirmedCount}</span>
        </div>
        <p className="text-sm text-ink-dim">
          קיצורים: Enter=אשר · Esc=דלג · ←→=candidates · /=חיפוש
        </p>
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
          יש התאמה ({displayMatched.length})
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
          ללא התאמה ({displayUnmatched.length})
        </button>
      </div>

      {/* Matched section */}
      {activeSection === "matched" && (
        <>
          {!current ? (
            <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/10 px-4 py-6 text-center">
              <p className="text-sm font-semibold text-emerald-50">
                {displayMatched.length === 0 && matched.length > 0
                  ? "סיימת! עברי ללשונית «ללא התאמה» לראות מה נשאר."
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

              {/* Manual search */}
              <div className="space-y-2">
                <input
                  ref={searchRef}
                  type="text"
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="חיפוש ידני ברשת (שם / ברקוד)… לחצי /"
                  className="w-full rounded-xl border border-white/15 bg-white/[0.04] px-3 py-2.5 text-sm text-white placeholder:text-ink-muted focus:border-white/30 focus:outline-none"
                />
                {searchResults.length > 0 && (
                  <div className="max-h-[30vh] overflow-y-auto space-y-1 rounded-xl border border-white/10 bg-black/50 p-2">
                    {searchResults.map((cp) => (
                      <button
                        key={cp.barcode}
                        type="button"
                        onClick={() => handlePickSearch(cp)}
                        className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-right text-sm text-white hover:bg-white/[0.08]"
                      >
                        <span className="text-ink-muted" dir="ltr">{cp.barcode}</span>{" "}
                        {cp.name}
                        {cp.brand ? ` · ${cp.brand}` : ""}
                        {cp.weightG ? ` · ${cp.weightG}g` : ""}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={handleSkip}
                  className="min-h-[48px] flex-1 touch-manipulation rounded-2xl border border-white/15 bg-white/[0.06] text-sm font-semibold text-white transition hover:bg-white/[0.1] active:scale-[0.99]"
                >
                  דלג (Esc)
                </button>
                <button
                  type="button"
                  onClick={() => void handleConfirm()}
                  disabled={!selectedCandidate}
                  className="min-h-[48px] flex-1 touch-manipulation rounded-2xl bg-emerald-600 text-sm font-semibold text-white transition hover:bg-emerald-500 active:scale-[0.99] disabled:opacity-40"
                >
                  אשר (Enter)
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Unmatched section */}
      {activeSection === "unmatched" && (
        <div className="space-y-3">
          {displayUnmatched.length === 0 ? (
            <div className="rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-6 text-center">
              <p className="text-sm text-amber-100">כל המוצרים מהמאגר נמצאו ברשת!</p>
            </div>
          ) : (
            <>
              <p className="text-sm text-ink-muted">
                {displayUnmatched.length} מוצרים מהמאגר המאומת ללא ברקוד.
                כשתטעני רשת נוספת — ניתן יהיה לחפש אותם שם.
              </p>
              <div className="max-h-[50vh] overflow-y-auto space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                {displayUnmatched.map((v) => (
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
