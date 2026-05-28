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

// Module-level caches: survive component unmount (navigating between screens)
// so we don't re-fetch the chain file or recompute matches every visit.
let cachedChainProducts: ChainProduct[] | null = null;
type MatchResults = {
  matched: Array<{ item: Verified100Item; candidates: ChainCandidate[] }>;
  unmatched: Verified100Item[];
};
let cachedResults: { signature: string; data: MatchResults } | null = null;
// Confirmed pairs in this session: verified item ids and the chain barcodes used.
// Persist across navigations so confirmed items/barcodes stay hidden.
const sessionConfirmedItemIds = new Set<string>();
const sessionConfirmedBarcodes = new Set<string>();

export function BarcodeMatch() {
  const navigate = useNavigate();
  const { catalog, upsertByBarcode } = useCatalog();
  const { items: verifiedItems, loading: verifiedLoading } = useVerified100();
  const { showToast } = useToast();

  const [chainProducts, setChainProducts] = useState<ChainProduct[]>(
    () => cachedChainProducts ?? [],
  );
  const [loadingChain, setLoadingChain] = useState(() => cachedChainProducts === null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [activeSection, setActiveSection] = useState<"matched" | "unmatched">("matched");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [candidateIdx, setCandidateIdx] = useState(0);
  const [confirmedCount, setConfirmedCount] = useState(0);
  const [skippedIds, setSkippedIds] = useState<Set<string>>(new Set());
  const [confirmedItemIds, setConfirmedItemIds] = useState<Set<string>>(
    () => new Set(sessionConfirmedItemIds),
  );
  const [confirmedBarcodes, setConfirmedBarcodes] = useState<Set<string>>(
    () => new Set(sessionConfirmedBarcodes),
  );
  const [searchText, setSearchText] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);

  // Load chain products once and cache across navigations (cache: no-store bypasses SW cache)
  useEffect(() => {
    if (cachedChainProducts !== null) return;
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
        cachedChainProducts = data;
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

  // Only the user's own verified DB (exclude Ministry of Health `moh:` entries),
  // de-duplicated by name. Firebase can contain the same product twice (e.g. an
  // older import keyed with a brand plus the brandless auto-import); collapse
  // them, preferring the more complete entry (one that has a brand).
  const tsvVerifiedItems = useMemo(() => {
    const eligible = verifiedItems.filter(
      (it) => it.name && it.calories100 != null && !it.id.startsWith("moh:"),
    );
    const byName = new Map<string, Verified100Item>();
    for (const it of eligible) {
      const key = normalizeText(it.name);
      const existing = byName.get(key);
      if (!existing) {
        byName.set(key, it);
      } else if (!existing.brand && it.brand) {
        byName.set(key, it);
      }
    }
    return Array.from(byName.values());
  }, [verifiedItems]);

  // Inverted word index over chain products: token -> chain product indices.
  // Lets us score only chain products that share a word with the verified item
  // instead of scanning all ~8000 chain products for every verified item.
  const chainIndex = useMemo(() => {
    const idx = new Map<string, number[]>();
    chainProducts.forEach((cp, ci) => {
      const tokens = new Set(
        normalizeText(cp.name)
          .split(" ")
          .filter((t) => t.length >= 2),
      );
      for (const t of tokens) {
        const arr = idx.get(t);
        if (arr) arr.push(ci);
        else idx.set(t, [ci]);
      }
    });
    return idx;
  }, [chainProducts]);

  // Keep catalog reads out of the heavy effect's deps so confirming a match
  // (which mutates the catalog via Firebase) doesn't restart the whole compute.
  const catalogRef = useRef(catalog);
  const catalogBarcodesRef = useRef(catalogBarcodes);
  useEffect(() => {
    catalogRef.current = catalog;
  }, [catalog]);
  useEffect(() => {
    catalogBarcodesRef.current = catalogBarcodes;
  }, [catalogBarcodes]);

  // Signature of the input data; if unchanged, reuse cached results (no recompute).
  const signature = `${tsvVerifiedItems.length}x${chainProducts.length}`;

  // For each verified item, find chain candidates (chunked to avoid blocking UI)
  const [matched, setMatched] = useState<Array<{ item: Verified100Item; candidates: ChainCandidate[] }>>(
    () => (cachedResults?.signature === signature ? cachedResults.data.matched : []),
  );
  const [unmatched, setUnmatched] = useState<Verified100Item[]>(
    () => (cachedResults?.signature === signature ? cachedResults.data.unmatched : []),
  );
  const [computing, setComputing] = useState(false);
  const [progress, setProgress] = useState({ scanned: 0, matched: 0 });

  useEffect(() => {
    if (!chainProducts.length || !tsvVerifiedItems.length) {
      setMatched([]);
      setUnmatched([]);
      return;
    }

    // Reuse cached results when the data hasn't changed (e.g. returning to this screen).
    if (cachedResults?.signature === signature) {
      setMatched(cachedResults.data.matched);
      setUnmatched(cachedResults.data.unmatched);
      setComputing(false);
      return;
    }

    let cancelled = false;

    // Debounce: while Firebase streams the verified data in bursts, the
    // signature changes repeatedly. Wait for it to settle before the heavy
    // scan, so the progress bar doesn't restart from 0 over and over.
    const startTimer = window.setTimeout(runCompute, 500);

    function runCompute() {
      if (cancelled) return;

      // Data changed (new signature) → previous confirmations no longer apply.
      sessionConfirmedItemIds.clear();
      sessionConfirmedBarcodes.clear();
      setConfirmedItemIds(new Set());
      setConfirmedBarcodes(new Set());

      setComputing(true);
      setProgress({ scanned: 0, matched: 0 });

      const catalogBarcodes = catalogBarcodesRef.current;
      // Precompute which verified items are already in the catalog (by name+brand).
      const verifiedInCatalog = new Set<string>();
      for (const cp of catalogRef.current) {
        if (cp.sources?.some((s) => s.type === "verified100")) {
          verifiedInCatalog.add(
            `${normalizeText(cp.name)}|${normalizeText(cp.brand ?? "")}`,
          );
        }
      }

      const CHUNK = 25;
      const matchedList: Array<{ item: Verified100Item; candidates: ChainCandidate[] }> = [];
      const unmatchedList: Verified100Item[] = [];
      let i = 0;

      function processChunk() {
        if (cancelled) return;
        const end = Math.min(i + CHUNK, tsvVerifiedItems.length);

        for (; i < end; i++) {
          const vItem = tsvVerifiedItems[i];
          const key = `${normalizeText(vItem.name)}|${normalizeText(vItem.brand ?? "")}`;
          if (verifiedInCatalog.has(key)) continue;

          // Narrow to chain products sharing at least one word with this item.
          const vTokens = normalizeText(vItem.name)
            .split(" ")
            .filter((t) => t.length >= 2);
          const candidateIdxs = new Set<number>();
          for (const t of vTokens) {
            const arr = chainIndex.get(t);
            if (arr) for (const ci of arr) candidateIdxs.add(ci);
          }

          const candidates: ChainCandidate[] = [];
          for (const ci of candidateIdxs) {
            const cp = chainProducts[ci];
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

        if (!cancelled) setProgress({ scanned: i, matched: matchedList.length });

        if (i < tsvVerifiedItems.length) {
          setTimeout(processChunk, 0);
        } else {
          if (!cancelled) {
            cachedResults = {
              signature,
              data: { matched: matchedList, unmatched: unmatchedList },
            };
            setMatched(matchedList);
            setUnmatched(unmatchedList);
            setComputing(false);
          }
        }
      }

      setTimeout(processChunk, 30);
    }

    return () => {
      cancelled = true;
      window.clearTimeout(startTimer);
    };
  }, [chainProducts, tsvVerifiedItems, chainIndex, signature]);

  // Confirmed items disappear; confirmed barcodes are removed from candidate lists
  // (the verified item and its matched chain barcode are now paired and done).
  const displayMatched = useMemo(
    () =>
      matched
        .filter((m) => !skippedIds.has(m.item.id) && !confirmedItemIds.has(m.item.id))
        .map((m) => ({
          item: m.item,
          candidates: m.candidates.filter((c) => !confirmedBarcodes.has(c.barcode)),
        }))
        .filter((m) => m.candidates.length > 0),
    [matched, skippedIds, confirmedItemIds, confirmedBarcodes],
  );
  const displayUnmatched = useMemo(
    () =>
      [
        ...unmatched,
        ...matched.filter((m) => skippedIds.has(m.item.id)).map((m) => m.item),
      ].filter((it) => !confirmedItemIds.has(it.id)),
    [unmatched, matched, skippedIds, confirmedItemIds],
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
        if (catalogBarcodes.has(cp.barcode) || confirmedBarcodes.has(cp.barcode)) return false;
        const n = normalizeText(cp.name);
        const b = normalizeText(cp.brand ?? "");
        return n.includes(q) || b.includes(q) || cp.barcode.includes(searchText.trim());
      })
      .slice(0, 10)
      .map((cp) => ({ ...cp, score: scoreChainMatch(cp, current.item) }));
  }, [searchText, current, chainProducts, catalogBarcodes, confirmedBarcodes]);

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
    sessionConfirmedItemIds.add(v.id);
    sessionConfirmedBarcodes.add(selectedCandidate.barcode);
    setConfirmedItemIds(new Set(sessionConfirmedItemIds));
    setConfirmedBarcodes(new Set(sessionConfirmedBarcodes));
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

  if (loadingChain) {
    return <p className="text-sm text-ink-muted">טוען נתוני רשת…</p>;
  }
  if (computing) {
    const total = tsvVerifiedItems.length || 1;
    const pct = Math.round((progress.scanned / total) * 100);
    return (
      <div className="space-y-3 py-4">
        <p className="text-sm font-semibold text-white">מחשב התאמות…</p>
        <div className="h-3 w-full overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full rounded-full bg-emerald-400 transition-all duration-150"
            style={{ width: `${pct}%` }}
          />
        </div>
        <p className="text-sm text-ink-muted">
          נסרקו {progress.scanned.toLocaleString("he-IL")} מתוך{" "}
          {tsvVerifiedItems.length.toLocaleString("he-IL")} ({pct}%) · נמצאו{" "}
          {progress.matched.toLocaleString("he-IL")} התאמות · {chainProducts.length.toLocaleString("he-IL")} ברשת
        </p>
      </div>
    );
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
          <span>מאומת: {verifiedLoading ? "טוען…" : tsvVerifiedItems.length}</span>
          <span>רשת: {chainProducts.length}</span>
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
