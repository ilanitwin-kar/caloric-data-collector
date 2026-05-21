import { useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Spinner } from "../components/Spinner";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import {
  computeOffPendingGaps,
  computeVerifiedGaps,
  countOffPendingAlreadyInCatalog,
  matchesGapSearch,
  type OffGapRow,
  type VerifiedGapRow,
} from "../utils/catalogGaps";

const PAGE_SIZE = 25;

function GapListSection<T extends { key: string }>({
  title,
  subtitle,
  items,
  renderRow,
  emptyText,
  accent,
  defaultOpen,
}: {
  title: string;
  subtitle: string;
  items: T[];
  renderRow: (item: T) => ReactNode;
  emptyText: string;
  accent: "violet" | "sky";
  defaultOpen?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;
  const border =
    accent === "violet" ? "border-violet-400/30 bg-violet-500/[0.06]" : "border-sky-400/30 bg-sky-500/[0.06]";
  const heading = accent === "violet" ? "text-violet-50" : "text-sky-50";

  return (
    <details className={`group rounded-2xl border ${border}`} open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={`text-sm font-semibold ${heading}`}>
              {title} ({items.length.toLocaleString("he-IL")})
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{subtitle}</p>
          </div>
          <span className="shrink-0 pt-1 text-[10px] text-ink-dim transition group-open:rotate-180">
            ▼
          </span>
        </div>
      </summary>
      <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
        {items.length === 0 ? (
          <p className="py-4 text-center text-xs text-ink-muted">{emptyText}</p>
        ) : (
          <>
            {visible.map((item) => (
              <div key={item.key}>{renderRow(item)}</div>
            ))}
            {hasMore ? (
              <button
                type="button"
                onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
                className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/[0.04] text-xs font-semibold text-white hover:border-white/25"
              >
                הצג עוד {Math.min(PAGE_SIZE, items.length - visibleCount).toLocaleString("he-IL")}{" "}
                (נשארו {(items.length - visibleCount).toLocaleString("he-IL")})
              </button>
            ) : null}
          </>
        )}
      </div>
    </details>
  );
}

function VerifiedGapCard({ row }: { row: VerifiedGapRow & { key: string } }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
      <p className="text-sm font-medium text-white">{row.name}</p>
      {row.brand ? <p className="mt-0.5 text-xs text-ink-muted">{row.brand}</p> : null}
      <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-ink-dim">
        {row.category ? <span>{row.category}</span> : null}
        {row.calories100 != null ? (
          <span>{row.calories100.toLocaleString("he-IL")} קל׳/100g</span>
        ) : null}
      </div>
    </div>
  );
}

function OffGapCard({ row }: { row: OffGapRow & { key: string } }) {
  return (
    <div className="rounded-xl border border-white/10 bg-black/25 px-3 py-2.5">
      <p className="text-sm font-medium text-white">{row.name}</p>
      {row.brand ? <p className="mt-0.5 text-xs text-ink-muted">{row.brand}</p> : null}
      <p className="mt-1 font-mono text-[10px] text-ink-dim" dir="ltr">
        {row.gtin}
      </p>
      {row.hasVerifiedMatch ? (
        <p className="mt-1 text-[10px] text-violet-200">יש התאמה במאגר מאומת</p>
      ) : null}
    </div>
  );
}

export function CatalogGaps() {
  const navigate = useNavigate();
  const { catalog, loading: catalogLoading, offPendingReviews, offPendingReady } = useCatalog();
  const { items: verifiedItems, loading: verifiedLoading } = useVerified100();
  const [search, setSearch] = useState("");

  const stats = useMemo(() => {
    const offInCatalog = countOffPendingAlreadyInCatalog(offPendingReviews, catalog);
    const verifiedGaps = computeVerifiedGaps(verifiedItems, catalog);
    const offGaps = computeOffPendingGaps(offPendingReviews, catalog);
    return {
      catalogCount: catalog.length,
      verifiedTotal: verifiedItems.length,
      verifiedGapCount: verifiedGaps.length,
      offPendingTotal: offPendingReviews.length,
      offGapCount: offGaps.length,
      offInCatalog,
      verifiedGaps,
      offGaps,
    };
  }, [catalog, verifiedItems, offPendingReviews]);

  const filteredVerified = useMemo(() => {
    return stats.verifiedGaps
      .filter((v) =>
        matchesGapSearch([v.id, v.name, v.brand ?? "", v.category ?? ""], search),
      )
      .map((v) => ({ ...v, key: v.id }));
  }, [stats.verifiedGaps, search]);

  const filteredOff = useMemo(() => {
    return stats.offGaps
      .filter((o) => matchesGapSearch([o.gtin, o.name, o.brand ?? ""], search))
      .map((o) => ({ ...o, key: o.gtin }));
  }, [stats.offGaps, search]);

  const listsReady = !catalogLoading && !verifiedLoading && offPendingReady;
  const computing = catalogLoading || verifiedLoading || !offPendingReady;

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-4">
        <button
          type="button"
          onClick={() => navigate("/settings")}
          className="text-xs font-semibold text-ink-muted transition hover:text-white"
        >
          ← חזרה להגדרות
        </button>
        <div>
          <p className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">
            מה חסר במאגר
          </p>
          <p className="mt-2 text-xs leading-relaxed text-ink-muted">
            השוואה למאגר המאומת (לפי שם/מותג) ולבדיקת OFF שכבר ייבאת (ברקוד). לא סורק אתרי סופר.
          </p>
        </div>
      </header>

      {computing ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-ink-muted">
          <Spinner />
          מחשב פערים…
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-ink-dim">במאגר שלך</p>
              <p className="mt-0.5 text-lg font-semibold text-white">
                {stats.catalogCount.toLocaleString("he-IL")}
              </p>
            </div>
            <div className="rounded-xl border border-violet-400/25 bg-violet-500/10 px-3 py-2">
              <p className="text-violet-100/80">חסר מול מאומת</p>
              <p className="mt-0.5 text-lg font-semibold text-violet-50">
                {stats.verifiedGapCount.toLocaleString("he-IL")}
              </p>
              <p className="text-[10px] text-ink-dim">
                מתוך {stats.verifiedTotal.toLocaleString("he-IL")}
              </p>
            </div>
            <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2">
              <p className="text-sky-100/80">חסר מול OFF (pending)</p>
              <p className="mt-0.5 text-lg font-semibold text-sky-50">
                {stats.offGapCount.toLocaleString("he-IL")}
              </p>
              <p className="text-[10px] text-ink-dim">
                {stats.offPendingTotal.toLocaleString("he-IL")} בבדיקה ·{" "}
                {stats.offInCatalog.toLocaleString("he-IL")} כבר במאגר
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2">
              <p className="text-ink-dim">פעולות</p>
              <div className="mt-1 flex flex-col gap-1">
                <button
                  type="button"
                  onClick={() => navigate("/off-review")}
                  className="text-left text-[11px] font-semibold text-sky-300 underline"
                >
                  בדיקת OFF
                </button>
                <button
                  type="button"
                  onClick={() => navigate("/")}
                  className="text-left text-[11px] font-semibold text-white/80 underline"
                >
                  הוספה ידנית (בית)
                </button>
              </div>
            </div>
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">חיפוש בשתי הרשימות</span>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="שם, מותג, ברקוד…"
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none"
            />
          </label>

          {listsReady ? (
            <div className="space-y-3">
              <GapListSection
                title="חסר מול מאגר מאומת"
                subtitle="פריטים במאגר המאומת בלי מוצר תואם במאגר האישי (התאמת שם/מותג)."
                items={filteredVerified}
                renderRow={(row) => <VerifiedGapCard row={row} />}
                emptyText={
                  search.trim()
                    ? "אין תוצאות לחיפוש."
                    : "כל פריטי המאגר המאומת מכוסים במאגר שלך (לפי התאמה)."
                }
                accent="violet"
                defaultOpen
              />
              <GapListSection
                title="חסר מול בדיקת OFF"
                subtitle="מוצרים שייבאת לרשימת בדיקה ועדיין אין להם ברקוד במאגר — אשרי בבדיקת OFF או הוסיפי ידנית."
                items={filteredOff}
                renderRow={(row) => <OffGapCard row={row} />}
                emptyText={
                  search.trim()
                    ? "אין תוצאות לחיפוש."
                    : "אין ממתינים מ-OFF שלא במאגר (או שכולם כבר אושרו)."
                }
                accent="sky"
                defaultOpen={filteredVerified.length === 0}
              />
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
