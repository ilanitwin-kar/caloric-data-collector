import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import type { SupermarketDraft, SupermarketTrip } from "../context/CatalogContext";
import { useCatalog } from "../context/CatalogContext";

function tripSectionTitle(tripId: string, drafts: SupermarketDraft[], trips: SupermarketTrip[]): string {
  const t = trips.find((x) => x.id === tripId);
  if (t) return `${t.name} · ${t.category}`;
  const d0 = drafts[0];
  const parts = [d0?.tripNameSnapshot, d0?.tripCategorySnapshot].filter(Boolean);
  return parts.length ? parts.join(" · ") : "מעבר";
}

export function PendingEdits() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    supermarketTrips,
    supermarketTripsReady,
    supermarketDrafts,
    supermarketDraftsReady,
    deleteSupermarketDraft,
  } = useCatalog();

  const listsReady = supermarketTripsReady && supermarketDraftsReady;

  const groups = useMemo(() => {
    const byTrip = new Map<string, SupermarketDraft[]>();
    for (const d of supermarketDrafts) {
      const list = byTrip.get(d.tripId) ?? [];
      list.push(d);
      byTrip.set(d.tripId, list);
    }
    return [...byTrip.entries()]
      .map(([tripId, drafts]) => {
        const sortedDrafts = [...drafts].sort(
          (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        const lastUpdate = Math.max(...sortedDrafts.map((d) => new Date(d.updatedAt).getTime()));
        return { tripId, drafts: sortedDrafts, lastUpdate };
      })
      .sort((a, b) => b.lastUpdate - a.lastUpdate);
  }, [supermarketDrafts]);

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">מוצרים לעריכה</p>
        <p className="break-words text-[13px] leading-relaxed text-ink-muted sm:text-sm">
          המוצרים מקובצים לפי מעבר. בחרי מוצר כדי להמשיך במסך הבית.
        </p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי לראות את הרשימה.</p>
      ) : !listsReady ? (
        <p className="text-sm text-ink-muted">טוען…</p>
      ) : groups.length === 0 ? (
        <p className="text-sm text-ink-muted">אין פריטים שנשמרו ממסך הסופר.</p>
      ) : (
        <div className="space-y-6">
          {groups.map(({ tripId, drafts }) => {
            const trip = supermarketTrips.find((x) => x.id === tripId);
            return (
            <section key={tripId} className="space-y-2">
              <div className="flex flex-col gap-2 border-b border-white/10 pb-2 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="min-w-0 break-words text-sm font-semibold text-white sm:text-base">
                  {tripSectionTitle(tripId, drafts, supermarketTrips)}
                </h2>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-ink-muted sm:text-[11px]">{drafts.length} מוצרים</span>
                  {trip || (drafts[0]?.tripNameSnapshot && drafts[0]?.tripCategorySnapshot) ? (
                    <button
                      type="button"
                      onClick={() =>
                        navigate(`/supermarket/${tripId}`, {
                          state: {
                            tripName: trip?.name ?? drafts[0]!.tripNameSnapshot!,
                            tripCategory: trip?.category ?? drafts[0]!.tripCategorySnapshot!,
                          },
                        })
                      }
                      className="min-h-[40px] touch-manipulation rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-white/25 hover:text-white active:scale-[0.99] sm:min-h-0 sm:py-1"
                    >
                      מילוי מהיר במעבר
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="space-y-2">
                {drafts.map((d) => (
                  <li
                    key={d.id}
                    className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <button
                      type="button"
                      onClick={() => navigate(`/?draft=${encodeURIComponent(d.id)}`)}
                      className="min-w-0 flex-1 text-right"
                    >
                      <p className="truncate font-semibold text-white">{d.name}</p>
                      {d.brand ? <p className="mt-0.5 truncate text-xs text-ink-muted">{d.brand}</p> : null}
                      <p className="mt-1 text-[11px] text-ink-dim" dir="ltr">
                        {new Date(d.updatedAt).toLocaleString("he-IL")}
                      </p>
                    </button>
                    <div className="flex w-full shrink-0 gap-2 sm:w-auto">
                      <button
                        type="button"
                        onClick={() => navigate(`/?draft=${encodeURIComponent(d.id)}`)}
                        className="min-h-[44px] touch-manipulation flex-1 rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99] sm:flex-none"
                      >
                        עריכה
                      </button>
                      <button
                        type="button"
                        onClick={() => void deleteSupermarketDraft(d.id)}
                        className="min-h-[44px] touch-manipulation flex-1 rounded-xl border border-white/15 px-3 text-xs font-semibold text-ink-muted transition hover:border-red-400/40 hover:text-red-200 active:scale-[0.99] sm:flex-none"
                      >
                        מחק
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
