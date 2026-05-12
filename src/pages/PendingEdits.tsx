import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useCatalog } from "../context/CatalogContext";

export function PendingEdits() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const { supermarketDrafts, supermarketDraftsReady, deleteSupermarketDraft } = useCatalog();

  const sorted = useMemo(
    () => [...supermarketDrafts].sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()),
    [supermarketDrafts],
  );

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">מוצרים לעריכה</p>
        <p className="text-sm text-ink-muted">בחרי מוצר כדי להמשיך במסך הבית ולהשלים פרטים לפני שמירה למאגר.</p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי לראות את הרשימה.</p>
      ) : !supermarketDraftsReady ? (
        <p className="text-sm text-ink-muted">טוען…</p>
      ) : sorted.length === 0 ? (
        <p className="text-sm text-ink-muted">אין פריטים שנשמרו ממסך הסופר.</p>
      ) : (
        <ul className="space-y-2">
          {sorted.map((d) => (
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
                <p className="mt-0.5 truncate text-xs text-ink-muted">
                  {[d.tripNameSnapshot, d.tripCategorySnapshot].filter(Boolean).join(" · ") || "מעבר"}
                  {d.brand ? ` · ${d.brand}` : ""}
                </p>
                <p className="mt-1 text-[11px] text-ink-dim" dir="ltr">
                  {new Date(d.updatedAt).toLocaleString("he-IL")}
                </p>
              </button>
              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => navigate(`/?draft=${encodeURIComponent(d.id)}`)}
                  className="min-h-[44px] rounded-xl bg-white px-4 text-xs font-semibold text-black transition hover:bg-neutral-200"
                >
                  עריכה
                </button>
                <button
                  type="button"
                  onClick={() => void deleteSupermarketDraft(d.id)}
                  className="min-h-[44px] rounded-xl border border-white/15 px-3 text-xs font-semibold text-ink-muted transition hover:border-red-400/40 hover:text-red-200"
                >
                  מחק
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
