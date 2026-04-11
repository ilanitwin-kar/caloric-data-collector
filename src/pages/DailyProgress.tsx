import { useMemo, useState } from "react";
import { useHealthLog } from "../context/HealthLogContext";
import { isTodayIso } from "../utils/date";
import { Spinner } from "../components/Spinner";

export function DailyProgress() {
  const {
    meals,
    weightEntries,
    activities,
    loading,
    error,
    addMeal,
    addWeight,
    addActivity,
  } = useHealthLog();

  const [mealName, setMealName] = useState("");
  const [mealCal, setMealCal] = useState("");
  const [weightKg, setWeightKg] = useState("");
  const [actName, setActName] = useState("");
  const [actMin, setActMin] = useState("");

  const todayMeals = useMemo(
    () => meals.filter((m) => isTodayIso(m.createdAt)),
    [meals],
  );
  const todayWeight = useMemo(
    () => weightEntries.filter((w) => isTodayIso(w.createdAt)),
    [weightEntries],
  );
  const todayAct = useMemo(
    () => activities.filter((a) => isTodayIso(a.createdAt)),
    [activities],
  );

  const totalCalIn = useMemo(
    () => todayMeals.reduce((s, m) => s + m.calories, 0),
    [todayMeals],
  );
  const totalBurn = useMemo(
    () =>
      todayAct.reduce(
        (s, a) => s + (a.caloriesBurned ?? 0),
        0,
      ),
    [todayAct],
  );
  const totalMinutes = useMemo(
    () => todayAct.reduce((s, a) => s + a.minutes, 0),
    [todayAct],
  );

  const latestWeight = weightEntries[0]?.kg;

  function submitMeal(e: React.FormEvent) {
    e.preventDefault();
    const c = parseFloat(mealCal);
    if (!mealName.trim() || !Number.isFinite(c)) return;
    addMeal(mealName, c);
    setMealName("");
    setMealCal("");
  }

  function submitWeight(e: React.FormEvent) {
    e.preventDefault();
    const k = parseFloat(weightKg);
    if (!Number.isFinite(k) || k <= 0) return;
    addWeight(k);
    setWeightKg("");
  }

  function submitAct(e: React.FormEvent) {
    e.preventDefault();
    const m = parseFloat(actMin);
    if (!actName.trim() || !Number.isFinite(m) || m <= 0) return;
    addActivity(actName, m);
    setActName("");
    setActMin("");
  }

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-1 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          התקדמות יומית
        </p>
        <p className="text-sm text-ink-muted">
          נתונים משותפים בזמן אמת — כל משתמש רואה עדכונים מיד.
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="!h-6 !w-6" />
          טוען נתונים…
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <section className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
        <h2 className="mb-3 text-xs font-semibold text-ink-dim">סיכום היום</h2>
        <dl className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="text-ink-muted">קלוריות (ארוחות)</dt>
            <dd className="font-medium tabular-nums text-white">
              {Math.round(totalCalIn)} קק&quot;ל
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">פעילות (דקות)</dt>
            <dd className="font-medium tabular-nums text-white">
              {Math.round(totalMinutes)} דק׳
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">שריפה מדווחת</dt>
            <dd className="font-medium tabular-nums text-white">
              {Math.round(totalBurn)} קק&quot;ל
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">משקל אחרון</dt>
            <dd className="font-medium tabular-nums text-white">
              {latestWeight !== undefined ? `${latestWeight.toFixed(1)} ק״ג` : "—"}
            </dd>
          </div>
        </dl>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">הוספת ארוחה</h2>
        <form onSubmit={submitMeal} className="space-y-3">
          <input
            value={mealName}
            onChange={(e) => setMealName(e.target.value)}
            placeholder="תיאור (למשל: בוקר)"
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white placeholder:text-ink-dim"
          />
          <input
            value={mealCal}
            onChange={(e) => setMealCal(e.target.value)}
            placeholder="קלוריות"
            inputMode="decimal"
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white placeholder:text-ink-dim"
          />
          <button
            type="submit"
            className="min-h-[48px] w-full rounded-2xl border border-white/25 bg-white/[0.1] font-semibold text-white transition active:scale-[0.99]"
          >
            שמור ארוחה
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">הוספת משקל</h2>
        <form onSubmit={submitWeight} className="space-y-3">
          <input
            value={weightKg}
            onChange={(e) => setWeightKg(e.target.value)}
            placeholder="משקל (ק״ג)"
            inputMode="decimal"
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white placeholder:text-ink-dim"
          />
          <button
            type="submit"
            className="min-h-[48px] w-full rounded-2xl border border-white/25 bg-white/[0.1] font-semibold text-white transition active:scale-[0.99]"
          >
            שמור משקל
          </button>
        </form>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">הוספת פעילות</h2>
        <form onSubmit={submitAct} className="space-y-3">
          <input
            value={actName}
            onChange={(e) => setActName(e.target.value)}
            placeholder="סוג פעילות"
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white placeholder:text-ink-dim"
          />
          <input
            value={actMin}
            onChange={(e) => setActMin(e.target.value)}
            placeholder="משך (דקות)"
            inputMode="numeric"
            className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-white placeholder:text-ink-dim"
          />
          <button
            type="submit"
            className="min-h-[48px] w-full rounded-2xl border border-white/25 bg-white/[0.1] font-semibold text-white transition active:scale-[0.99]"
          >
            שמור פעילות
          </button>
        </form>
      </section>

      <section className="space-y-2">
        <h2 className="text-xs font-semibold text-ink-dim">היום היום</h2>
        <ul className="space-y-2 text-sm text-ink-muted">
          {todayMeals.length === 0 && todayWeight.length === 0 && todayAct.length === 0 ? (
            <li>אין רישומים להיום עדיין.</li>
          ) : null}
          {todayMeals.map((m) => (
            <li key={m.id} className="rounded-xl border border-white/10 px-3 py-2 text-white">
              ארוחה: {m.name} · {m.calories} קק&quot;ל
            </li>
          ))}
          {todayWeight.map((w) => (
            <li key={w.id} className="rounded-xl border border-white/10 px-3 py-2 text-white">
              משקל: {w.kg.toFixed(1)} ק״ג
            </li>
          ))}
          {todayAct.map((a) => (
            <li key={a.id} className="rounded-xl border border-white/10 px-3 py-2 text-white">
              {a.name} · {a.minutes} דק׳
              {a.caloriesBurned != null ? ` · ${a.caloriesBurned} קק״ל` : ""}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
