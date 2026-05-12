import { useState } from "react";
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
  const { createSupermarketTrip } = useCatalog();
  const [tripName, setTripName] = useState("");
  const [tripCategory, setTripCategory] = useState("");
  const [busy, setBusy] = useState(false);

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

  return (
    <div className="space-y-6 pb-4">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="font-display text-2xl font-semibold tracking-tight text-white md:text-3xl">סופר — מעבר חדש</p>
        <p className="text-sm text-ink-muted">שם וקטגוריה לזיהוי המעבר (למשל &quot;שישי&quot; / &quot;מזון יבש&quot;).</p>
      </header>

      {!user ? (
        <p className="text-sm text-ink-muted">התחברי כדי ליצור מעבר.</p>
      ) : (
        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <Field label="שם המעבר" value={tripName} onChange={setTripName} placeholder="למשל קניות שישי" />
          <Field label="קטגוריה" value={tripCategory} onChange={setTripCategory} placeholder="למשל מזון יבש" />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => navigate("/")}
              className="min-h-[48px] flex-1 rounded-2xl border border-white/15 bg-transparent px-4 text-sm font-semibold text-ink-muted transition hover:border-white/25 hover:text-white"
            >
              ביטול
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void handleContinue()}
              className="min-h-[48px] flex-[2] rounded-2xl bg-white text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99] disabled:opacity-50"
            >
              המשך
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
