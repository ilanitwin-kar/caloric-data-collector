import { useRef, useState } from "react";
import { Spinner } from "../components/Spinner";
import { useVerified100 } from "../context/Verified100Context";

export function Settings() {
  const { items, loading, importTsv } = useVerified100();
  const [importing, setImporting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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
        <h2 className="text-sm font-semibold text-white">מאגר מאומת (100g)</h2>
        <p className="mt-1 text-xs text-ink-muted">
          קובץ TSV/CSV למילוי אוטומטי בשדות בבית (לפי שם מוצר). הנתונים נשמרים בענן תחת
          החשבון שלך.
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
    </div>
  );
}
