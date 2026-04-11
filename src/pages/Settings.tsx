export function Settings() {
  return (
    <div className="space-y-8 pb-4">
      <header className="space-y-2 border-b border-white/10 pb-6">
        <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
          הגדרות
        </p>
      </header>

      <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 text-center">
        <p className="font-display text-2xl font-semibold text-white md:text-3xl">
          אינטליגנציה קלורית
        </p>
        <p className="mt-2 text-sm text-ink-muted">Caloric Intelligence</p>
      </div>
    </div>
  );
}
