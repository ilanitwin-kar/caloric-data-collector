export function Settings() {
  return (
    <div className="space-y-10 pb-4">
      <header className="space-y-1 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          הגדרות
        </p>
        <p className="text-sm text-ink-muted">
          מיתוג האפליקציה · נתונים ב-Firebase Realtime Database (סנכרון בזמן אמת).
        </p>
      </header>

      <p className="rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-xs leading-relaxed text-ink-muted">
        ודאי בקונסולת Firebase שהכללים (Rules) מאפשרים קריאה/כתיבה למפתחות
        <code className="mx-1 text-white/90"> products</code>,
        <code className="mx-1 text-white/90"> meals</code>,
        <code className="mx-1 text-white/90"> weightEntries</code>,
        <code className="mx-1 text-white/90"> activities</code>
        — לפחות לבדיקות (למשל משתמשים מחוברים בלבד בייצור).
      </p>

      <div className="flex flex-col items-center gap-6 rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-transparent px-6 py-12 text-center">
        <div
          className="flex h-20 w-20 items-center justify-center rounded-2xl border border-white/20 bg-black"
          aria-hidden
        >
          <span className="font-display text-3xl font-semibold tracking-tight text-white">
            CI
          </span>
        </div>
        <div className="space-y-2">
          <h1 className="font-display text-3xl font-semibold tracking-[0.02em] text-white">
            אינטליגנציה קלורית
          </h1>
          <p className="max-w-xs text-sm leading-relaxed text-ink-muted">
            תזונה מדויקת ליחידה — נבנה לבהירות במעבר וליד השולחן.
          </p>
        </div>
        <p className="text-xs tracking-wide text-ink-dim">
          סנכרון ענן · Firebase
        </p>
      </div>
    </div>
  );
}
