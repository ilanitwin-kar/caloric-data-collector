import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OffVerifiedComparePanel } from "../components/OffVerifiedComparePanel";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import type { OffPendingReview } from "../utils/offCatalog";

const PAGE_SIZE = 25;

function matchesSearch(item: OffPendingReview, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const link = item.offReviewMeta.verifiedLink;
  const hay = [
    item.gtin,
    item.id,
    item.name,
    item.brand,
    item.offReviewMeta.offName,
    item.offReviewMeta.offBrand,
    link?.verifiedName,
    link?.verifiedBrand,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return hay.includes(q);
}

function sortWithMatch(items: OffPendingReview[]): OffPendingReview[] {
  return [...items].sort((a, b) => {
    const sa = a.offReviewMeta.verifiedLink?.matchScore ?? 0;
    const sb = b.offReviewMeta.verifiedLink?.matchScore ?? 0;
    if (sb !== sa) return sb - sa;
    return (a.offReviewMeta.offName || a.name).localeCompare(
      b.offReviewMeta.offName || b.name,
      "he",
    );
  });
}

function sortWithoutMatch(items: OffPendingReview[]): OffPendingReview[] {
  return [...items].sort((a, b) => {
    const na = `${a.offReviewMeta.offName || a.name} ${a.offReviewMeta.offBrand || a.brand || ""}`;
    const nb = `${b.offReviewMeta.offName || b.name} ${b.offReviewMeta.offBrand || b.brand || ""}`;
    return na.localeCompare(nb, "he");
  });
}

function OffReviewRow({
  item,
  inCatalog,
  busyId,
  onBusy,
  withMatch,
  expanded,
  onToggleExpand,
}: {
  item: OffPendingReview;
  inCatalog: boolean;
  busyId: string | null;
  onBusy: (id: string | null) => void;
  withMatch: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const navigate = useNavigate();
  const { approveOffPendingReview, rejectOffPendingReview } = useCatalog();
  const link = item.offReviewMeta.verifiedLink;
  const offName = item.offReviewMeta.offName || item.name;
  const offBrand = item.offReviewMeta.offBrand || item.brand;

  return (
    <div
      className={
        "rounded-xl border " +
        (withMatch ? "border-violet-400/20 bg-violet-500/[0.04]" : "border-white/10 bg-white/[0.02]")
      }
    >
      <div className="flex flex-wrap items-start gap-2 px-3 py-2.5">
        <button
          type="button"
          onClick={onToggleExpand}
          className="min-w-0 flex-1 text-start"
          aria-expanded={expanded}
        >
          <p className="font-mono text-[11px] font-semibold text-white/90" dir="ltr">
            {item.gtin ?? item.id}
          </p>
          {withMatch && link ? (
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              <span className="text-sky-100/90">OFF:</span> {offName}
              {offBrand ? ` · ${offBrand}` : ""}
              <span className="mx-1 text-ink-dim">|</span>
              <span className="text-emerald-100/90">מאומת:</span> {link.verifiedName}
              {link.verifiedBrand ? ` · ${link.verifiedBrand}` : ""}
              <span className="text-violet-200/80"> · ציון {link.matchScore}</span>
            </p>
          ) : (
            <p className="mt-1 text-[11px] leading-snug text-ink-muted">
              {offName}
              {offBrand ? ` · ${offBrand}` : ""}
            </p>
          )}
        </button>
        {inCatalog ? (
          <span className="shrink-0 rounded-md border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-semibold text-amber-100">
            במאגר
          </span>
        ) : null}
      </div>

      {expanded ? (
        <div className="border-t border-white/10 px-3 pb-3 pt-2 space-y-3">
          <OffVerifiedComparePanel
            gtin={item.gtin ?? item.id}
            link={link}
            appliedPer100={item.nutrition?.per100g}
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => navigate(`/?offReview=${encodeURIComponent(item.id)}`)}
              className="min-h-[40px] flex-1 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
            >
              {withMatch ? "ערוך ובדוק" : "ערוך — חפש במאגר"}
            </button>
            <button
              type="button"
              disabled={busyId === item.id || inCatalog}
              onClick={() => {
                onBusy(item.id);
                void approveOffPendingReview(item).finally(() => onBusy(null));
              }}
              className="min-h-[40px] flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
            >
              {busyId === item.id ? "שומר…" : "הוסף למאגר"}
            </button>
            <button
              type="button"
              disabled={busyId === item.id}
              onClick={() => {
                onBusy(item.id);
                void rejectOffPendingReview(item.id).finally(() => onBusy(null));
              }}
              className="min-h-[40px] rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
            >
              דחה
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-1.5 border-t border-white/5 px-3 pb-2 pt-1">
          <button
            type="button"
            onClick={onToggleExpand}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-ink-muted hover:text-white"
          >
            פרטים
          </button>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => navigate(`/?offReview=${encodeURIComponent(item.id)}`)}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-sky-200/90 hover:text-sky-50"
          >
            ערוך
          </button>
          <button
            type="button"
            disabled={busyId === item.id || inCatalog}
            onClick={() => {
              onBusy(item.id);
              void approveOffPendingReview(item).finally(() => onBusy(null));
            }}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-white/90 hover:text-white disabled:opacity-50"
          >
            הוסף
          </button>
          <button
            type="button"
            disabled={busyId === item.id}
            onClick={() => {
              onBusy(item.id);
              void rejectOffPendingReview(item.id).finally(() => onBusy(null));
            }}
            className="rounded-lg px-2 py-1 text-[10px] font-semibold text-red-200/90 hover:text-red-100"
          >
            דחה
          </button>
        </div>
      )}
    </div>
  );
}

function CollapsibleReviewSection({
  title,
  subtitle,
  items,
  withMatch,
  catalogIds,
  busyId,
  onBusy,
  defaultOpen,
}: {
  title: string;
  subtitle: string;
  items: OffPendingReview[];
  withMatch: boolean;
  catalogIds: Set<string>;
  busyId: string | null;
  onBusy: (id: string | null) => void;
  defaultOpen?: boolean;
}) {
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const visible = items.slice(0, visibleCount);
  const hasMore = visibleCount < items.length;

  if (items.length === 0) return null;

  return (
    <details
      className={
        "group rounded-2xl border " +
        (withMatch ?
          "border-violet-400/30 bg-violet-500/[0.06]"
        : "border-white/15 bg-white/[0.03]")
      }
      open={defaultOpen}
    >
      <summary className="cursor-pointer list-none px-4 py-3 marker:content-none [&::-webkit-details-marker]:hidden">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2
              className={
                "text-sm font-semibold " + (withMatch ? "text-violet-50" : "text-white")
              }
            >
              {title} ({items.length.toLocaleString("he-IL")})
            </h2>
            <p className="mt-0.5 text-[11px] leading-relaxed text-ink-muted">{subtitle}</p>
          </div>
          <span className="shrink-0 text-[10px] text-ink-dim group-open:rotate-180 transition pt-1">
            ▼
          </span>
        </div>
      </summary>

      <div className="space-y-2 border-t border-white/10 px-3 pb-3 pt-2">
        {visible.map((item) => (
          <OffReviewRow
            key={item.id}
            item={item}
            inCatalog={catalogIds.has(item.id)}
            busyId={busyId}
            onBusy={onBusy}
            withMatch={withMatch}
            expanded={expandedId === item.id}
            onToggleExpand={() =>
              setExpandedId((cur) => (cur === item.id ? null : item.id))
            }
          />
        ))}
        {hasMore ? (
          <button
            type="button"
            onClick={() => setVisibleCount((n) => n + PAGE_SIZE)}
            className="w-full min-h-[44px] rounded-xl border border-white/15 bg-white/[0.04] text-xs font-semibold text-white hover:border-white/25"
          >
            הצג עוד {Math.min(PAGE_SIZE, items.length - visibleCount).toLocaleString("he-IL")}{" "}
            (נשארו {(items.length - visibleCount).toLocaleString("he-IL")} בקבוצה)
          </button>
        ) : null}
      </div>
    </details>
  );
}

export function PendingOffReview() {
  const { user } = useAuth();
  const { offPendingReviews, offPendingReady, catalog } = useCatalog();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const catalogIds = useMemo(
    () => new Set(catalog.map((p) => p.gtin ?? p.id)),
    [catalog],
  );

  const totals = useMemo(() => {
    let withMatch = 0;
    let withoutMatch = 0;
    for (const item of offPendingReviews) {
      if (item.offReviewMeta.verifiedLink) withMatch += 1;
      else withoutMatch += 1;
    }
    return { withMatch, withoutMatch };
  }, [offPendingReviews]);

  const { withVerifiedMatch, withoutVerifiedMatch, totalFiltered } = useMemo(() => {
    const withVerifiedMatch: OffPendingReview[] = [];
    const withoutVerifiedMatch: OffPendingReview[] = [];
    for (const item of offPendingReviews) {
      if (!matchesSearch(item, search)) continue;
      if (item.offReviewMeta.verifiedLink) withVerifiedMatch.push(item);
      else withoutVerifiedMatch.push(item);
    }
    return {
      withVerifiedMatch: sortWithMatch(withVerifiedMatch),
      withoutVerifiedMatch: sortWithoutMatch(withoutVerifiedMatch),
      totalFiltered: withVerifiedMatch.length + withoutVerifiedMatch.length,
    };
  }, [offPendingReviews, search]);

  const totalPending = offPendingReviews.length;

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          בדיקת OFF
        </p>
        <p className="text-[13px] leading-relaxed text-ink-muted sm:text-sm">
          שתי קבוצות מקופלות — פתחי רק את מה שעובדים עליו. שורה אחת למוצר; «פרטים» לשוואה מלאה.
        </p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי לראות את הרשימה.</p>
      ) : !offPendingReady ? (
        <p className="text-sm text-ink-muted">טוען…</p>
      ) : totalPending === 0 ? (
        <p className="text-sm text-ink-muted">
          אין מוצרים ממתינים. ייבוא OFF בהגדרות ממלא את הרשימה הזו (לא את המאגר ישירות).
        </p>
      ) : (
        <div className="space-y-4">
          <div className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-ink-muted leading-relaxed">
            <p>
              <span className="font-semibold text-white">נשארו </span>
              {totalPending.toLocaleString("he-IL")} לבדיקה
              {search.trim() ?
                ` · מוצגים ${totalFiltered.toLocaleString("he-IL")} אחרי חיפוש`
              : null}
            </p>
            {!search.trim() ? (
              <p className="mt-1">
                {totals.withMatch.toLocaleString("he-IL")} עם התאמה למאומת ·{" "}
                {totals.withoutMatch.toLocaleString("he-IL")} OFF בלבד
              </p>
            ) : null}
          </div>

          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-ink-muted">חיפוש (ברקוד, שם, מותג)</span>
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="למשל 729000… או שם מוצר"
              className="min-h-[44px] rounded-xl border border-white/15 bg-black/40 px-3 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none"
            />
          </label>

          {totalFiltered === 0 ? (
            <p className="text-sm text-ink-muted">אין תוצאות לחיפוש.</p>
          ) : (
            <div className="space-y-3">
              <CollapsibleReviewSection
                key={`with-${search}`}
                title="התאמה למאגר המאומת"
                subtitle="השווי OFF מול מאומת לפני אישור. ממוין לפי ציון התאמה."
                items={withVerifiedMatch}
                withMatch
                catalogIds={catalogIds}
                busyId={busyId}
                onBusy={setBusyId}
              />
              <CollapsibleReviewSection
                key={`without-${search}`}
                title="ללא התאמה למאגר — OFF בלבד"
                subtitle="ערכי — שנה שם/מותג לחיפוש במאגר; הברקוד נשאר מ־OFF."
                items={withoutVerifiedMatch}
                withMatch={false}
                catalogIds={catalogIds}
                busyId={busyId}
                onBusy={setBusyId}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
