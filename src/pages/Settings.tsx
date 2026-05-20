import { useEffect, useRef, useState } from "react";
import { Spinner } from "../components/Spinner";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import {
  clearBodyWeightKg,
  readBodyWeightKg,
  writeBodyWeightKg,
} from "../utils/bodyWeightStorage";
import { STEPS_PER_MINUTE, WALKING_MET } from "../utils/walkingBurn";

type OffImportProgress = {
  phase: "fetch" | "write";
  page?: number;
  scanned: number;
  skipped: number;
  queued: number;
  written: number;
};

export function Settings() {
  const { catalog, importOpenFoodFactsIsrael } = useCatalog();
  const { items, loading, importTsv } = useVerified100();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bodyKgInput, setBodyKgInput] = useState("");
  const [bodySavedAt, setBodySavedAt] = useState<number | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [offImporting, setOffImporting] = useState(false);
  const [offProgress, setOffProgress] = useState<OffImportProgress | null>(null);
  const [offResult, setOffResult] = useState<string | null>(null);
  const offAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const w = readBodyWeightKg();
    setBodyKgInput(w !== null ? String(w) : "");
  }, []);

  useEffect(() => {
    if (!bodySavedAt) return;
    const t = window.setTimeout(() => setBodySavedAt(null), 2200);
    return () => window.clearTimeout(t);
  }, [bodySavedAt]);

  async function handleOffImport() {
    if (offImporting) return;
    const ctrl = new AbortController();
    offAbortRef.current = ctrl;
    setOffImporting(true);
    setOffResult(null);
    setOffProgress({ phase: "fetch", scanned: 0, skipped: 0, queued: 0, written: 0 });
    try {
      const res = await importOpenFoodFactsIsrael(items, {
        signal: ctrl.signal,
        onProgress: setOffProgress,
      });
      setOffResult(
        `נסרקו ${res.scanned.toLocaleString("he-IL")} · נוספו ${res.added.toLocaleString("he-IL")} · דולגו ${res.skipped.toLocaleString("he-IL")} · תזונה מהמאומת: ${res.verifiedOverrides.toLocaleString("he-IL")}`,
      );
    } catch {
      setOffResult("ייבוא נכשל");
    } finally {
      setOffImporting(false);
      setOffProgress(null);
      offAbortRef.current = null;
    }
  }

  function cancelOffImport() {
    offAbortRef.current?.abort();
  }

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          הגדרות
        </p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="font-display text-2xl font-semibold text-white md:text-3xl">
          אינטליגנציה קלורית
        </p>
        <p className="mt-2 text-sm text-ink-muted">Caloric Intelligence</p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-white">משקל גוף</h2>
        <p className="mt-1 text-xs text-ink-muted">
          לחישוב צעדי הליכה להוצאת קלוריות (לפי MET {WALKING_MET}, כ־{STEPS_PER_MINUTE} צעדים לדקה).
        </p>
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <label className="flex min-w-[8rem] flex-1 flex-col gap-1">
            <span className="text-xs text-ink-dim">קילוגרם</span>
            <input
              type="number"
              inputMode="decimal"
              min={20}
              max={400}
              step="0.1"
              value={bodyKgInput}
              onChange={(e) => setBodyKgInput(e.target.value)}
              placeholder="למשל 65"
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none"
            />
          </label>
          <button
            type="button"
            onClick={() => {
              setBodyError(null);
              const raw = bodyKgInput.trim();
              if (!raw) {
                clearBodyWeightKg();
                setBodySavedAt(Date.now());
                return;
              }
              const n = parseFloat(raw.replace(",", "."));
              if (!Number.isFinite(n) || n < 20 || n > 400) {
                setBodyError("נא להזין משקל תקין (20–400 ק״ג).");
                return;
              }
              writeBodyWeightKg(n);
              setBodySavedAt(Date.now());
            }}
            className="min-h-[44px] rounded-xl bg-white px-4 text-sm font-semibold text-black transition active:scale-[0.99] active:bg-neutral-200"
          >
            שמור
          </button>
        </div>
        {bodyError ? <p className="mt-2 text-xs text-red-200">{bodyError}</p> : null}
        {bodySavedAt ? (
          <p className="mt-2 text-xs text-emerald-200">נשמר</p>
        ) : null}
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-white">מאגר מאומת (100g)</h2>
        <p className="mt-1 text-xs text-ink-muted">
          קובץ TSV/CSV (קטגוריה, מותג, שם, חלבון, שומן, פחמימה, קלוריות). משמש להצעות ולעדיפות
          תזונה בייבוא OFF.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {loading ? (
            <span className="inline-flex items-center gap-2 text-xs text-ink-muted">
              <Spinner className="!h-4 !w-4" />
              טוען מהענן…
            </span>
          ) : (
            <span className="text-xs text-ink-muted">
              {items.length.toLocaleString("he-IL")} פריטים זמינים
            </span>
          )}
          <button
            type="button"
            disabled={importing}
            onClick={() => fileRef.current?.click()}
            className="rounded-xl border border-white/20 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition disabled:opacity-50 hover:border-white/30"
          >
            {importing ? "מייבא…" : "ייבוא קובץ מאגר"}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".tsv,.csv,text/csv,text/tab-separated-values,text/plain"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              setImporting(true);
              void importTsv(f).finally(() => setImporting(false));
            }}
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-sm font-semibold text-white">ייבוא Open Food Facts (ישראל)</h2>
        <p className="mt-1 text-xs leading-relaxed text-ink-muted">
          מוסיף לקטלוג מוצרים עם ברקוד מ־OFF (ישראל + תזונה). לא דורס מוצרים שכבר בקטלוג או שנשמרו
          ידנית. אם שם+מותג תואמים למאגר המאומת ({items.length.toLocaleString("he-IL")} פריטים) —
          נשמרת התזונה המאומתת.
        </p>
        <p className="mt-2 text-xs text-ink-dim">
          בקטלוג כרגע: {catalog.length.toLocaleString("he-IL")} מוצרים
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={offImporting || loading}
            onClick={() => void handleOffImport()}
            className="min-h-[44px] rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {offImporting ? "מייבא OFF…" : "ייבא מוצרי OFF לישראל"}
          </button>
          {offImporting ? (
            <button
              type="button"
              onClick={cancelOffImport}
              className="min-h-[44px] rounded-xl border border-white/20 px-4 text-sm font-semibold text-white"
            >
              ביטול
            </button>
          ) : null}
        </div>
        {offProgress ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ink-muted">
            {offProgress.phase === "fetch" ? (
              <p>
                שלב איסוף
                {offProgress.page != null ? ` · עמוד ${offProgress.page}` : ""} · נסרקו{" "}
                {offProgress.scanned.toLocaleString("he-IL")} · דולגו{" "}
                {offProgress.skipped.toLocaleString("he-IL")} · בתור{" "}
                {offProgress.queued.toLocaleString("he-IL")}
              </p>
            ) : (
              <p>
                שלב שמירה · נכתבו {offProgress.written.toLocaleString("he-IL")}
              </p>
            )}
          </div>
        ) : null}
        {offResult ? <p className="mt-2 text-xs text-emerald-200">{offResult}</p> : null}
      </section>
    </div>
  );
}
