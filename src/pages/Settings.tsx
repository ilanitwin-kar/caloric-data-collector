import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import { countOffImportedCatalogProducts } from "../utils/offCatalogPolicy";
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
  const navigate = useNavigate();
  const {
    catalog,
    importOpenFoodFactsIsrael,
    offPendingReviews,
    offPendingReady,
    offImportCheckpoint,
    offImportCheckpointReady,
    purgeOffImportedFromCatalog,
    clearOffImportCheckpoint,
  } = useCatalog();
  const { items, loading, importTsv } = useVerified100();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [bodyKgInput, setBodyKgInput] = useState("");
  const [bodySavedAt, setBodySavedAt] = useState<number | null>(null);
  const [bodyError, setBodyError] = useState<string | null>(null);

  const [offImporting, setOffImporting] = useState(false);
  const [purgingOff, setPurgingOff] = useState(false);
  const [offProgress, setOffProgress] = useState<OffImportProgress | null>(null);
  const [offResult, setOffResult] = useState<string | null>(null);
  const offAbortRef = useRef<AbortController | null>(null);

  const offInCatalogCount = useMemo(() => countOffImportedCatalogProducts(catalog), [catalog]);

  useEffect(() => {
    const w = readBodyWeightKg();
    setBodyKgInput(w !== null ? String(w) : "");
  }, []);

  useEffect(() => {
    if (!bodySavedAt) return;
    const t = window.setTimeout(() => setBodySavedAt(null), 2200);
    return () => window.clearTimeout(t);
  }, [bodySavedAt]);

  const resumePage =
    offImportCheckpointReady && offImportCheckpoint && offImportCheckpoint.nextPage >= 2
      ? offImportCheckpoint.nextPage
      : null;

  async function runOffImport(resume: boolean) {
    if (offImporting) return;
    if (resume) {
      if (!resumePage) return;
    } else if (resumePage) {
      const ok = window.confirm(
        `ייבוא קודם לא הסתיים (המשך מעמוד ${resumePage}).\n\nלהתחיל מעמוד 1 מחדש? (ההתקדמות השמורה תימחק)`,
      );
      if (!ok) return;
      await clearOffImportCheckpoint();
    }
    const ctrl = new AbortController();
    offAbortRef.current = ctrl;
    setOffImporting(true);
    setOffResult(null);
    setOffProgress({ phase: "fetch", scanned: 0, skipped: 0, queued: 0, written: 0 });
    try {
      const res = await importOpenFoodFactsIsrael(items, {
        signal: ctrl.signal,
        startPage: resume ? resumePage! : 1,
        onProgress: setOffProgress,
      });
      const parts = [
        res.completed
          ? "הייבוא הסתיים"
          : `נעצר (מגבלת OFF)${res.resumeNextPage != null ? ` · המשך מעמוד ${res.resumeNextPage}` : ""}`,
        `נסרקו ${res.scanned.toLocaleString("he-IL")}`,
        `לבדיקה: ${res.queued.toLocaleString("he-IL")}`,
        `דולגו ${res.skipped.toLocaleString("he-IL")}`,
      ];
      if (res.stoppedEarly && res.resumeNextPage) {
        parts.push(`המשך מעמוד ${res.resumeNextPage}`);
      }
      if (res.totalOffReported) {
        parts.push(`(~${res.totalOffReported.toLocaleString("he-IL")} ב-OFF ישראל)`);
      }
      setOffResult(parts.join(" · "));
    } catch {
      setOffResult("ייבוא נכשל");
    } finally {
      setOffImporting(false);
      setOffProgress(null);
      offAbortRef.current = null;
    }
  }

  async function handlePurgeOffCatalog() {
    if (purgingOff || offInCatalogCount === 0) return;
    const ok = window.confirm(
      `למחוק ${offInCatalogCount.toLocaleString("he-IL")} מוצרים שיובאו מ-OFF מהמאגר?\n\nמוצרים ששמרת ידנית (או ללא מקור OFF) לא יימחקו.`,
    );
    if (!ok) return;
    setPurgingOff(true);
    try {
      await purgeOffImportedFromCatalog();
      await clearOffImportCheckpoint();
      setOffResult(null);
    } finally {
      setPurgingOff(false);
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

      <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
        <h2 className="text-sm font-semibold text-white">ייבוא Open Food Facts (ישראל)</h2>
        <p className="text-xs leading-relaxed text-ink-muted">
          שלב 1: מוצרים נכנסים ל־<button type="button" className="text-sky-300 underline" onClick={() => navigate("/off-review")}>בדיקת OFF</button> (לא ישר למאגר).
          שלב 2: אחרי &quot;הוסף למאגר&quot; — נכנס לקטלוג. מוצרים ידניים לא נמחקים.
        </p>
        <p className="text-xs text-ink-dim">
          במאגר: {catalog.length.toLocaleString("he-IL")} · מ־OFF (למחיקה):{" "}
          {offInCatalogCount.toLocaleString("he-IL")} · ממתינים לבדיקה:{" "}
          {offPendingReady ? offPendingReviews.length.toLocaleString("he-IL") : "…"}
        </p>

        {resumePage && !offImporting ? (
          <p className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-100">
            ייבוא לא הסתיים — לחצי «המשך ייבוא (מעמוד {resumePage})» כדי לסרוק ולייבא עד העצירה
            הבאה (~6 שניות בין עמודים).
          </p>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={offImporting || loading || purgingOff}
            onClick={() => void runOffImport(false)}
            className="min-h-[44px] rounded-xl bg-white px-4 text-sm font-semibold text-black transition hover:bg-neutral-200 disabled:opacity-50"
          >
            {offImporting ? "מייבא OFF…" : "ייבא OFF"}
          </button>
          <button
            type="button"
            disabled={offImporting || loading || purgingOff || !resumePage}
            onClick={() => void runOffImport(true)}
            className="min-h-[44px] rounded-xl border border-amber-400/40 bg-amber-500/15 px-4 text-sm font-semibold text-amber-50 transition hover:bg-amber-500/25 disabled:opacity-40"
          >
            {offImporting
              ? "מייבא OFF…"
              : resumePage
                ? `המשך ייבוא (מעמוד ${resumePage})`
                : "המשך ייבוא"}
          </button>
          <button
            type="button"
            disabled={purgingOff || offImporting || offInCatalogCount === 0}
            onClick={() => void handlePurgeOffCatalog()}
            className="min-h-[44px] rounded-xl border border-red-400/35 bg-red-500/10 px-4 text-sm font-semibold text-red-100 disabled:opacity-50"
          >
            {purgingOff ? "מוחק…" : `מחק ייבוא OFF מהמאגר (${offInCatalogCount})`}
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

        <p className="text-[11px] text-ink-dim leading-relaxed">
          סדר מומלץ: מחק ייבוא OFF מהמאגר → ייבא OFF מחדש → בדיקת OFF → הוסף למאגר.
        </p>

        {offProgress ? (
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ink-muted">
            {offProgress.phase === "fetch" ? (
              <p>
                שלב איסוף
                {offProgress.page != null ? ` · עמוד ${offProgress.page}` : ""} · נסרקו{" "}
                {offProgress.scanned.toLocaleString("he-IL")} · דולגו{" "}
                {offProgress.skipped.toLocaleString("he-IL")} · לבדיקה בתור{" "}
                {offProgress.queued.toLocaleString("he-IL")}
              </p>
            ) : (
              <p>שלב שמירה לבדיקה · {offProgress.written.toLocaleString("he-IL")}</p>
            )}
          </div>
        ) : null}
        {offResult ? <p className="text-xs text-emerald-200 leading-relaxed">{offResult}</p> : null}
      </section>
    </div>
  );
}
