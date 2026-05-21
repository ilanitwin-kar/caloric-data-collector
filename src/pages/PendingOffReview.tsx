import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { OffVerifiedComparePanel } from "../components/OffVerifiedComparePanel";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import type { OffPendingReview } from "../utils/offCatalog";

function OffReviewCard({
  item,
  inCatalog,
  busyId,
  onBusy,
}: {
  item: OffPendingReview;
  inCatalog: boolean;
  busyId: string | null;
  onBusy: (id: string | null) => void;
}) {
  const navigate = useNavigate();
  const { approveOffPendingReview, rejectOffPendingReview } = useCatalog();
  const hasMatch = Boolean(item.offReviewMeta.verifiedLink);

  return (
    <article
      className={
        "rounded-2xl border p-4 space-y-3 " +
        (hasMatch
          ? "border-violet-400/25 bg-violet-500/[0.06]"
          : "border-white/10 bg-white/[0.03]")
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-2">
        <p className="font-mono text-sm font-semibold text-white" dir="ltr">
          {item.gtin ?? item.id}
        </p>
        {inCatalog ? (
          <span className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
            כבר במאגר
          </span>
        ) : null}
      </div>

      <OffVerifiedComparePanel
        gtin={item.gtin ?? item.id}
        link={item.offReviewMeta.verifiedLink}
        appliedPer100={item.nutrition?.per100g}
      />

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busyId === item.id}
          onClick={() => navigate(`/?offReview=${encodeURIComponent(item.id)}`)}
          className="min-h-[44px] flex-1 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
        >
                    ערוך — חפשי במאגר המאומת
        </button>
        <button
          type="button"
          disabled={busyId === item.id || inCatalog}
          onClick={() => {
            onBusy(item.id);
            void approveOffPendingReview(item).finally(() => onBusy(null));
          }}
          className="min-h-[44px] flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
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
          className="min-h-[44px] rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
        >
          דחה
        </button>
      </div>
    </article>
  );
}

function ReviewSection({
  title,
  subtitle,
  items,
  catalogIds,
  busyId,
  onBusy,
}: {
  title: string;
  subtitle: string;
  items: OffPendingReview[];
  catalogIds: Set<string>;
  busyId: string | null;
  onBusy: (id: string | null) => void;
}) {
  if (items.length === 0) return null;
  return (
    <section className="space-y-3">
      <div className="rounded-xl border border-violet-400/30 bg-violet-500/10 px-3 py-2.5">
        <h2 className="text-sm font-semibold text-violet-50">{title}</h2>
        <p className="mt-0.5 text-[11px] text-violet-100/85 leading-relaxed">{subtitle}</p>
        <p className="mt-1 text-xs text-violet-100/70">
          {items.length.toLocaleString("he-IL")} מוצרים
        </p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <OffReviewCard
            key={item.id}
            item={item}
            inCatalog={catalogIds.has(item.id)}
            busyId={busyId}
            onBusy={onBusy}
          />
        ))}
      </div>
    </section>
  );
}

export function PendingOffReview() {
  const { user } = useAuth();
  const { offPendingReviews, offPendingReady, catalog } = useCatalog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const catalogIds = useMemo(
    () => new Set(catalog.map((p) => p.gtin ?? p.id)),
    [catalog],
  );

  const { withVerifiedMatch, withoutVerifiedMatch } = useMemo(() => {
    const withVerifiedMatch: OffPendingReview[] = [];
    const withoutVerifiedMatch: OffPendingReview[] = [];
    for (const item of offPendingReviews) {
      if (item.offReviewMeta.verifiedLink) withVerifiedMatch.push(item);
      else withoutVerifiedMatch.push(item);
    }
    return { withVerifiedMatch, withoutVerifiedMatch };
  }, [offPendingReviews]);

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          בדיקת OFF
        </p>
        <p className="text-[13px] leading-relaxed text-ink-muted sm:text-sm">
          לכל מוצר רואים שני טורים: OFF (ברקוד) מול המאגר המאומת (שם/מותג). רק אחרי שמוודאים שזה
          אותו מוצר — «הוסף למאגר» או «ערוך ובדוק».
        </p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי לראות את הרשימה.</p>
      ) : !offPendingReady ? (
        <p className="text-sm text-ink-muted">טוען…</p>
      ) : offPendingReviews.length === 0 ? (
        <p className="text-sm text-ink-muted">
          אין מוצרים ממתינים. ייבוא OFF בהגדרות ממלא את הרשימה הזו (לא את המאגר ישירות).
        </p>
      ) : (
        <div className="space-y-8">
          <p className="text-xs text-ink-muted">
            סה״כ {offPendingReviews.length.toLocaleString("he-IL")} לבדיקה
          </p>
          <ReviewSection
            title="התאמה למאגר המאומת"
            subtitle="השווי שם ומותג בין OFF למאומת לפני אישור. התזונה בטופס לרוב מהמאומת."
            items={withVerifiedMatch}
            catalogIds={catalogIds}
            busyId={busyId}
            onBusy={setBusyId}
          />
          <ReviewSection
            title="ללא התאמה למאגר — OFF בלבד"
            subtitle="לחצי «ערוך» — שנה שם/מותג כדי לחפש במאגר המאומת; הברקוד נשאר מ־OFF."
            items={withoutVerifiedMatch}
            catalogIds={catalogIds}
            busyId={busyId}
            onBusy={setBusyId}
          />
        </div>
      )}
    </div>
  );
}
