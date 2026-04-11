import { useMemo } from "react";
import { useHealthLog } from "../context/HealthLogContext";
import { dayKeyLocal, lastNDayKeys } from "../utils/date";
import { Spinner } from "../components/Spinner";

export function Charts() {
  const { meals, weightEntries, loading, error } = useHealthLog();

  const caloriesByDay = useMemo(() => {
    const keys = lastNDayKeys(7);
    const map: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
    for (const m of meals) {
      const k = dayKeyLocal(m.createdAt);
      if (k in map) map[k] += m.calories;
    }
    return keys.map((k) => ({ key: k, calories: map[k] ?? 0 }));
  }, [meals]);

  const maxCal = useMemo(
    () => Math.max(1, ...caloriesByDay.map((d) => d.calories)),
    [caloriesByDay],
  );

  const recentWeight = useMemo(() => {
    return [...weightEntries]
      .sort(
        (a, b) =>
          new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
      )
      .slice(-14);
  }, [weightEntries]);

  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-1 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          תרשימים
        </p>
        <p className="text-sm text-ink-muted">
          מבוסס על נתונים חיים מ-Firebase (ארוחות ומשקל).
        </p>
      </header>

      {loading && (
        <div className="flex items-center gap-3 text-sm text-ink-muted">
          <Spinner className="!h-6 !w-6" />
          טוען…
        </div>
      )}
      {error && (
        <p className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </p>
      )}

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-ink-dim">
          קלוריות לפי יום (7 ימים אחרונים)
        </h2>
        <div className="flex h-44 items-end justify-between gap-1 rounded-2xl border border-white/10 bg-white/[0.03] px-2 pb-2 pt-4">
          {caloriesByDay.map(({ key, calories }) => (
            <div
              key={key}
              className="flex min-w-0 flex-1 flex-col items-center gap-1"
            >
              <div
                className="w-full max-w-[36px] rounded-t bg-white/80 transition-all"
                style={{
                  height: `${(calories / maxCal) * 100}%`,
                  minHeight: calories > 0 ? "4px" : "0",
                }}
                title={`${key}: ${Math.round(calories)} קק״ל`}
              />
              <span className="truncate text-[10px] text-ink-dim">
                {key.slice(5)}
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-xs font-semibold text-ink-dim">משקל (14 רישומים אחרונים)</h2>
        {recentWeight.length === 0 ? (
          <p className="text-sm text-ink-muted">אין עדיין רישומי משקל.</p>
        ) : (
          <div className="space-y-2">
            <svg
              viewBox="0 0 400 120"
              className="w-full rounded-2xl border border-white/10 bg-black/40"
              preserveAspectRatio="none"
            >
              <polyline
                fill="none"
                stroke="rgba(255,255,255,0.85)"
                strokeWidth="2"
                points={recentWeight
                  .map((w, i) => {
                    const minW = Math.min(...recentWeight.map((x) => x.kg));
                    const maxW = Math.max(...recentWeight.map((x) => x.kg));
                    const span = Math.max(0.1, maxW - minW);
                    const x = (i / Math.max(1, recentWeight.length - 1)) * 380 + 10;
                    const y =
                      110 -
                      ((w.kg - minW) / span) * 100;
                    return `${x},${y}`;
                  })
                  .join(" ")}
              />
            </svg>
            <ul className="grid grid-cols-2 gap-2 text-xs text-ink-muted sm:grid-cols-3">
              {recentWeight.map((w) => (
                <li key={w.id} className="tabular-nums">
                  {new Date(w.createdAt).toLocaleDateString("he-IL")}:{" "}
                  <span className="text-white">{w.kg.toFixed(1)} ק״ג</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
