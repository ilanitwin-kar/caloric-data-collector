import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";
import type { OffPendingReview } from "../utils/offCatalog";
import { VERIFIED_AUTO_APPLY_MIN_SCORE } from "../utils/verifiedTsv";

function VerifiedLinkBanner({ item }: { item: OffPendingReview }) {
  const link = item.offReviewMeta.verifiedLink;
  if (!link) {
    return (
      <p className="text-[11px] leading-relaxed text-amber-100/90">
        אין התאמה למאגר המאומת (5,758) — התזונה מ־OFF בלבד. הקישור לברקוד הוא רק השיוך שאת
        מאשרת כשמוסיפים למאגר.
      </p>
    );
  }
  return (
    <div className="space-y-1.5 text-[11px] leading-relaxed">
      <p className="font-semibold text-sky-50">התאמה למאגר המאומת (לפי שם — לא לפי ברקוד)</p>
      <p className="text-sky-100/90">
        OFF: {link.offName}
        {link.offBrand ? ` · ${link.offBrand}` : ""}
      </p>
      <p className="text-emerald-100/95">
        מאומת: {link.verifiedName}
        {link.verifiedBrand ? ` · ${link.verifiedBrand}` : ""}
        {link.verifiedCategory ? ` · ${link.verifiedCategory}` : ""}
      </p>
      <p className="text-ink-muted">
        ציון התאמה: {link.matchScore} (מינימום לאוטו: {VERIFIED_AUTO_APPLY_MIN_SCORE}) · תזונה
        כרגע: {link.nutritionFromVerified ? "מהמאומת" : "מ־OFF"}
      </p>
      <p className="text-ink-dim">
        הברקוד {item.gtin} מגיע מ־OFF. המאומת אין בו ברקוד — ודאי שהשמות מתאימים לאותו מוצר
        לפני הוספה למאגר.
      </p>
    </div>
  );
}

export function PendingOffReview() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    offPendingReviews,
    offPendingReady,
    catalog,
    approveOffPendingReview,
    rejectOffPendingReview,
  } = useCatalog();
  const [busyId, setBusyId] = useState<string | null>(null);

  const catalogIds = useMemo(
    () => new Set(catalog.map((p) => p.gtin ?? p.id)),
    [catalog],
  );

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">
          בדיקת OFF
        </p>
        <p className="text-[13px] leading-relaxed text-ink-muted sm:text-sm">
          מוצרים מ־Open Food Facts מחכים כאן. רק אחרי בדיקה ועריכה — &quot;הוסף למאגר&quot;. כך לא
          נכנסים לקטלוג מוצרים שלא אישרת.
        </p>
        <p className="text-xs text-ink-dim">
          המאגר המאומת (5,758) נשאר בנפרד: הוא מציע התאמה לפי שם ומותג, לא מקשר ברקוד אוטומטית.
          כאן רואים בבירור מה OFF אמר ומה המאומת התאים.
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
        <div className="space-y-3">
          <p className="text-xs text-ink-muted">
            {offPendingReviews.length.toLocaleString("he-IL")} מוצרים לבדיקה
          </p>
          {offPendingReviews.map((item) => {
            const inCatalog = catalogIds.has(item.id);
            return (
              <article
                key={item.id}
                className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3"
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-semibold text-white" dir="ltr">
                      {item.gtin ?? item.id}
                    </p>
                    <p className="mt-1 text-sm text-white">{item.name}</p>
                    {item.brand ? (
                      <p className="text-xs text-ink-muted">{item.brand}</p>
                    ) : null}
                  </div>
                  {inCatalog ? (
                    <span className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-2 py-1 text-[10px] font-semibold text-amber-100">
                      כבר במאגר
                    </span>
                  ) : null}
                </div>

                <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
                  <VerifiedLinkBanner item={item} />
                </div>

                {item.nutrition?.per100g ? (
                  <p className="text-[11px] text-ink-muted" dir="ltr">
                    {[
                      item.nutrition.per100g.calories != null
                        ? `${item.nutrition.per100g.calories} kcal`
                        : null,
                      item.nutrition.per100g.proteinG != null
                        ? `P ${item.nutrition.per100g.proteinG}g`
                        : null,
                      item.nutrition.per100g.carbsG != null
                        ? `C ${item.nutrition.per100g.carbsG}g`
                        : null,
                      item.nutrition.per100g.fatG != null
                        ? `F ${item.nutrition.per100g.fatG}g`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    /100g
                  </p>
                ) : null}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => navigate(`/?offReview=${encodeURIComponent(item.id)}`)}
                    className="min-h-[44px] flex-1 rounded-xl border border-white/20 px-3 py-2 text-xs font-semibold text-white hover:border-white/35"
                  >
                    ערוך ובדוק
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id || inCatalog}
                    onClick={() => {
                      setBusyId(item.id);
                      void approveOffPendingReview(item).finally(() => setBusyId(null));
                    }}
                    className="min-h-[44px] flex-1 rounded-xl bg-white px-3 py-2 text-xs font-semibold text-black disabled:opacity-50"
                  >
                    {busyId === item.id ? "שומר…" : "הוסף למאגר"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => {
                      setBusyId(item.id);
                      void rejectOffPendingReview(item.id).finally(() => setBusyId(null));
                    }}
                    className="min-h-[44px] rounded-xl border border-red-400/35 bg-red-500/10 px-3 py-2 text-xs font-semibold text-red-200"
                  >
                    דחה
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
