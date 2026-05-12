import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";

function Field({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
      />
    </label>
  );
}

export function SupermarketNewTrip() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const {
    createSupermarketTrip,
    supermarketTrips,
    supermarketTripsReady,
    supermarketDrafts,
    supermarketDraftsReady,
  } = useCatalog();
  const [tripName, setTripName] = useState("");
  const [tripCategory, setTripCategory] = useState("");
  const [busy, setBusy] = useState(false);

  const draftCountByTripId = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of supermarketDrafts) {
      m.set(d.tripId, (m.get(d.tripId) ?? 0) + 1);
    }
    return m;
  }, [supermarketDrafts]);

  const listsReady = supermarketTripsReady && supermarketDraftsReady;

  async function handleContinue() {
    if (!user) return;
    setBusy(true);
    try {
      const id = await createSupermarketTrip({
        name: tripName,
        category: tripCategory,
      });
      if (id) {
        navigate(`/supermarket/${id}`, {
          state: { tripName: tripName.trim(), tripCategory: tripCategory.trim() },
        });
      }
    } finally {
      setBusy(false);
    }
  }

  function openTrip(t: { id: string; name: string; category: string }) {
    navigate(`/supermarket/${t.id}`, {
      state: { tripName: t.name, tripCategory: t.category },
    });
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-3 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white sm:text-3xl">סופר</p>
        <p className="break-words text-[13px] leading-relaxed text-ink-muted sm:text-sm">
          מעבר חדש — אחרי שמירת מוצר במילוי המהיר אפשר להמשיך באותו מעבר. למעבר אחר חזרי לכאן ובחרי מעבר מהרשימה או צרי חדש.
        </p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי ליצור מעבר או להמשיך קיימים.</p>
      ) : (
        <>
          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-sm font-semibold text-white">מעבר חדש</p>
            <Field label="שם המעבר" value={tripName} onChange={setTripName} placeholder="למשל קניות שישי" />
            <Field label="קטגוריה" value={tripCategory} onChange={setTripCategory} placeholder="למשל מזון יבש" />
            <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
              <button
                type="button"
                onClick={() => navigate("/")}
                className="min-h-[48px] touch-manipulation flex-1 rounded-2xl border border-white/15 bg-transparent px-4 text-sm font-semibold text-ink-muted transition hover:border-white/25 hover:text-white active:scale-[0.99] sm:min-w-[8rem]"
              >
                ביטול
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleContinue()}
                className="min-h-[48px] touch-manipulation flex-1 rounded-2xl bg-white px-3 text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-50 sm:min-w-0 sm:flex-[2]"
              >
                המשך למילוי מהיר
              </button>
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
            <p className="text-sm font-semibold text-white">המעברים שלי</p>
            {!listsReady ? (
              <p className="text-sm text-ink-muted">טוען…</p>
            ) : supermarketTrips.length === 0 ? (
              <p className="text-sm text-ink-muted">עדיין אין מעברים. צרי מעבר חדש למעלה.</p>
            ) : (
              <ul className="space-y-2">
                {supermarketTrips.map((t) => {
                  const n = draftCountByTripId.get(t.id) ?? 0;
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => openTrip(t)}
                        className="flex min-h-[52px] w-full touch-manipulation flex-col gap-1 rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-right transition active:scale-[0.99] hover:border-white/20 hover:bg-black/35"
                      >
                        <span className="break-words font-semibold text-white">{t.name}</span>
                        <span className="break-words text-xs text-ink-muted">{t.category}</span>
                        <span className="text-[11px] text-ink-dim">
                          {n === 0 ? "אין עדיין מוצרים לעריכה במעבר" : `${n} מוצרים לעריכה במעבר`}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
