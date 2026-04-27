import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import { useBodyWeightKg } from "../hooks/useBodyWeightKg";
import { fmt1, parseNum } from "../utils/number";
import { normalizeBarcode } from "../utils/openFoodFacts";
import { WALKING_MET, walkingStepsToBurnKcal } from "../utils/walkingBurn";
import { useNavigate } from "react-router-dom";

type UsageTag = "ready" | "ingredient" | "raw" | "cooked" | "dry";
type MeasureKey = "unit" | "tbsp" | "tsp" | "cup" | "g100";

const USAGE_OPTIONS: Array<{ id: UsageTag; label: string }> = [
  { id: "ready", label: "מוכן" },
  { id: "ingredient", label: "חומר גלם" },
  { id: "raw", label: "גולמי" },
  { id: "cooked", label: "מבושל" },
  { id: "dry", label: "יבש" },
];

const MEASURE_OPTIONS: Array<{ id: MeasureKey; label: string }> = [
  { id: "unit", label: "יחידה" },
  { id: "tbsp", label: "כף" },
  { id: "tsp", label: "כפית" },
  { id: "cup", label: "כוס" },
  { id: "g100", label: "100g" },
];

function Field({
  label,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: "decimal" | "numeric" | "text";
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-medium text-ink-muted">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
      />
    </label>
  );
}

function parseKeywords(raw: string): string[] | undefined {
  const list = raw
    .split(/[,\n]/g)
    .map((x) => x.trim())
    .filter(Boolean);
  return list.length ? list : undefined;
}

function newInternalId(): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? (crypto as Crypto).randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `internal:${uuid}`;
}

export function Home() {
  const navigate = useNavigate();
  const { catalog, upsertByBarcode, upsertInternal } = useCatalog();
  const { findMatches } = useVerified100();
  const bodyKg = useBodyWeightKg();

  const [isInternal, setIsInternal] = useState(false);
  const [internalId, setInternalId] = useState(() => newInternalId());

  const [barcodeRaw, setBarcodeRaw] = useState("");
  const barcodeDigits = useMemo(() => normalizeBarcode(barcodeRaw), [barcodeRaw]);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [brand, setBrand] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
  const [category, setCategory] = useState("");
  const [usageTags, setUsageTags] = useState<UsageTag[]>(["ready"]);
  const [defaultMeasure, setDefaultMeasure] = useState<MeasureKey>("unit");
  const [commonMeasures, setCommonMeasures] = useState<MeasureKey[]>(["unit", "g100"]);

  const [per100Basis, setPer100Basis] = useState<"g" | "ml">("g");

  const [kcal100, setKcal100] = useState("");
  const [prot100, setProt100] = useState("");
  const [carb100, setCarb100] = useState("");
  const [fat100, setFat100] = useState("");
  const [verifiedPicked, setVerifiedPicked] = useState(false);
  const [verifiedPickedSig, setVerifiedPickedSig] = useState<string | null>(null);
  const [verifiedSuggestions, setVerifiedSuggestions] = useState<
    Array<{
      name: string;
      brand?: string;
      category?: string;
      calories100?: number;
      protein100?: number;
      carbs100?: number;
      fat100?: number;
    }>
  >([]);
  const [verifiedOffset, setVerifiedOffset] = useState(0);

  const isAlreadyInCatalog = useMemo(() => {
    if (isInternal) return catalog.some((p) => p.id === internalId);
    if (!barcodeDigits) return false;
    return catalog.some((p) => p.id === barcodeDigits || p.gtin === barcodeDigits);
  }, [barcodeDigits, catalog, internalId, isInternal]);

  const existingByBarcode = useMemo(() => {
    if (isInternal) return null;
    if (!barcodeDigits) return null;
    return catalog.find((p) => p.id === barcodeDigits || p.gtin === barcodeDigits) ?? null;
  }, [barcodeDigits, catalog, isInternal]);

  const [existingBarcodeDismissed, setExistingBarcodeDismissed] = useState<string | null>(null);

  const [catalogMatchIgnoredSig, setCatalogMatchIgnoredSig] = useState<string | null>(null);
  const [catalogMatchCheckedIds, setCatalogMatchCheckedIds] = useState<Record<string, true>>({});

  const catalogNameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 4) return [];
    const sig = `${q}|${brand.trim().toLowerCase()}|${keywordsRaw.trim().toLowerCase()}|${category.trim().toLowerCase()}`;
    if (catalogMatchIgnoredSig === sig) return [];
    const tokens = q.split(/\s+/g).filter(Boolean);
    const scoreOf = (p: (typeof catalog)[number]) => {
      const hay = `${p.name} ${p.shortName ?? ""} ${p.brand ?? ""} ${p.category ?? ""} ${(p.keywords ?? []).join(" ")}`.toLowerCase();
      let score = 0;
      if (p.name.toLowerCase() === q) score += 100;
      if (p.shortName && p.shortName.toLowerCase() === q) score += 90;
      if (hay.startsWith(q)) score += 40;
      if (hay.includes(q)) score += 25;
      for (const t of tokens) {
        if (t.length >= 3 && hay.includes(t)) score += 5;
      }
      return score;
    };
    return catalog
      .map((p) => ({ p, score: scoreOf(p) }))
      .filter((x) => x.score >= 25)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4)
      .map((x) => x.p);
  }, [brand, catalog, catalogMatchIgnoredSig, category, keywordsRaw, name]);

  const catalogMatchSig = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 4) return null;
    return `${q}|${brand.trim().toLowerCase()}|${keywordsRaw.trim().toLowerCase()}|${category.trim().toLowerCase()}`;
  }, [brand, category, keywordsRaw, name]);

  const showCatalogNameHint = catalogNameMatches.length > 0;

  // (intentionally no "load into form" action here; we only open existing items in the Catalog)

  useEffect(() => {
    // If barcode changes, allow showing the "exists" notice again.
    setExistingBarcodeDismissed(null);
  }, [barcodeDigits]);

  const [totalWeightG, setTotalWeightG] = useState("");
  const [unitsPerPack, setUnitsPerPack] = useState("");
  const [unitWeightG, setUnitWeightG] = useState("");
  const lastPackEditRef = useRef<"units" | "unitWeight" | null>(null);

  const [unitsPer100g, setUnitsPer100g] = useState("");
  const [tbspPer100g, setTbspPer100g] = useState("");
  const [tspPer100g, setTspPer100g] = useState("");
  const [cupsPer100g, setCupsPer100g] = useState("");

  const [error, setError] = useState<string | null>(null);

  const [scannerOpen, setScannerOpen] = useState(false);
  useEffect(() => {
    if (!scannerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scannerOpen]);

  // Suggest 100g macros from verified DB by best matches on name+brand (do not auto-apply).
  useEffect(() => {
    if (per100Basis === "ml") {
      // Verified DB is per 100g; avoid suggesting for 100ml mode.
      setVerifiedSuggestions([]);
      setVerifiedOffset(0);
      return;
    }
    const sig = `${name.trim()}|${brand.trim()}|${keywordsRaw.trim()}|${category.trim()}`;
    if (isAlreadyInCatalog || (verifiedPickedSig && verifiedPickedSig === sig)) {
      setVerifiedSuggestions([]);
      setVerifiedOffset(0);
      return;
    }
    const n = name.trim();
    if (n.length < 3) {
      setVerifiedSuggestions([]);
      setVerifiedOffset(0);
      return;
    }
    const qName = `${n} ${keywordsRaw.replace(/[,]+/g, " ")} ${category}`.trim();
    const matches = findMatches({ name: qName, brand: brand.trim() || undefined }, { limit: 12 });
    setVerifiedSuggestions(
      matches.map((m) => ({
        name: m.name,
        brand: m.brand,
        category: m.category,
        calories100: m.calories100,
        protein100: m.protein100,
        carbs100: m.carbs100,
        fat100: m.fat100,
      })),
    );
    setVerifiedOffset(0);
  }, [name, brand, keywordsRaw, category, findMatches, verifiedPickedSig, isAlreadyInCatalog, per100Basis]);

  const visibleVerifiedSuggestions = useMemo(
    () => verifiedSuggestions.slice(verifiedOffset, verifiedOffset + 4),
    [verifiedSuggestions, verifiedOffset],
  );

  // Package triad: user inputs totalWeight always; typing either units or unitWeight calculates the other.
  useEffect(() => {
    const tw = parseNum(totalWeightG);
    if (!(tw > 0)) return;
    const u = parseNum(unitsPerPack);
    const uw = parseNum(unitWeightG);

    if (lastPackEditRef.current === "units") {
      if (u > 0) setUnitWeightG(fmt1(tw / u));
      return;
    }
    if (lastPackEditRef.current === "unitWeight") {
      if (uw > 0) setUnitsPerPack(String(Math.max(1, Math.round(tw / uw))));
    }
  }, [totalWeightG, unitsPerPack, unitWeightG]);

  const per100 = useMemo(() => {
    const kcal = parseNum(kcal100);
    const p = parseNum(prot100);
    const c = parseNum(carb100);
    const f = parseNum(fat100);
    return {
      calories: Number.isFinite(kcal) ? kcal : undefined,
      proteinG: Number.isFinite(p) ? p : undefined,
      carbsG: Number.isFinite(c) ? c : undefined,
      fatG: Number.isFinite(f) ? f : undefined,
    };
  }, [kcal100, prot100, carb100, fat100]);

  const measures = useMemo(() => {
    const u = parseNum(unitsPer100g);
    const tb = parseNum(tbspPer100g);
    const ts = parseNum(tspPer100g);
    const cu = parseNum(cupsPer100g);
    return {
      unitsPer100g: Number.isFinite(u) && u > 0 ? u : undefined,
      tbspPer100g: Number.isFinite(tb) && tb > 0 ? tb : undefined,
      tspPer100g: Number.isFinite(ts) && ts > 0 ? ts : undefined,
      cupsPer100g: Number.isFinite(cu) && cu > 0 ? cu : undefined,
    };
  }, [unitsPer100g, tbspPer100g, tspPer100g, cupsPer100g]);

  const pkg = useMemo(() => {
    const tw = parseNum(totalWeightG);
    const u = parseNum(unitsPerPack);
    const uw = parseNum(unitWeightG);
    return {
      totalW: Number.isFinite(tw) && tw > 0 ? tw : undefined,
      units: Number.isFinite(u) && u > 0 ? u : undefined,
      unitW: Number.isFinite(uw) && uw > 0 ? uw : undefined,
    };
  }, [totalWeightG, unitsPerPack, unitWeightG]);

  const gramsPer = useMemo(() => {
    const gUnit = pkg.unitW;
    const gTbsp = measures.tbspPer100g ? 100 / measures.tbspPer100g : undefined;
    const gTsp = measures.tspPer100g ? 100 / measures.tspPer100g : undefined;
    const gCup = measures.cupsPer100g ? 100 / measures.cupsPer100g : undefined;
    const gPiece = measures.unitsPer100g ? 100 / measures.unitsPer100g : undefined;
    return { gUnit, gTbsp, gTsp, gCup, gPiece };
  }, [measures, pkg.unitW]);

  const kcalFor = useCallback(
    (grams: number | undefined) => {
      if (!grams || !Number.isFinite(grams) || grams <= 0) return undefined;
      if (typeof per100.calories !== "number") return undefined;
      return (per100.calories * grams) / 100;
    },
    [per100.calories],
  );

  const stepsFor = useCallback(
    (kcal: number | undefined) => {
      if (!kcal || !Number.isFinite(kcal) || kcal <= 0) return "—";
      if (bodyKg === null) return "הגדרות ← משקל גוף";
      const n = walkingStepsToBurnKcal(kcal, bodyKg);
      return n === null ? "—" : `כ־${n.toLocaleString("he-IL")} צעדים`;
    },
    [bodyKg],
  );

  async function handleSave() {
    setError(null);

    const n = name.trim();
    if (n.length < 2) {
      setError("נא להזין שם מוצר.");
      return;
    }

    const keywords = parseKeywords(keywordsRaw);
    const usage = usageTags.length ? usageTags : (isInternal ? (["ingredient"] as UsageTag[]) : (["ready"] as UsageTag[]));

    const totalW = pkg.totalW;
    if (!totalW) {
      setError("נא להזין משקל כולל של האריזה (גרם).");
      return;
    }
    const units = pkg.units;
    const unitW = pkg.unitW;
    // If user provided only total weight, treat the entire package/cup as a single unit.
    const inferredUnitsPerPack = units ?? (unitW ? totalW / unitW : 1);

    if (!isInternal) {
      const bc = barcodeDigits;
      if (!bc || bc.length < 8) {
        setError("ברקוד לא תקין (חייב לפחות 8 ספרות).");
        return;
      }
      await upsertByBarcode({
        barcode: bc,
        name: n,
        shortName: shortName.trim() || undefined,
        brand: brand.trim() || undefined,
        keywords,
        category: category.trim() || undefined,
        usageTags: usage,
        per100Basis,
        defaultMeasure,
        commonMeasures,
        per100,
        totalWeightG: totalW,
        unitsPerPack: inferredUnitsPerPack,
        measures,
        sourceType: "manual",
      });
      setVerifiedPicked(false);
      setVerifiedPickedSig(null);
      return;
    }

    await upsertInternal({
      id: internalId,
      name: n,
      shortName: shortName.trim() || undefined,
      brand: brand.trim() || undefined,
      keywords,
      category: category.trim() || undefined,
      usageTags: usage,
      per100Basis,
      defaultMeasure,
      commonMeasures,
      per100,
      totalWeightG: totalW,
      unitsPerPack: inferredUnitsPerPack,
      measures,
      sourceType: "manual",
    });
    setVerifiedPicked(false);
    setVerifiedPickedSig(null);
  }

  return (
    <>
      <div className="space-y-6 pb-4">
        <header className="space-y-2 border-b border-white/10 pb-6">
          <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
            מאגר מוצרים
          </p>
          <p className="text-sm text-ink-muted">
            שדות חובה: שם מוצר + מאקרו ל־{per100Basis === "ml" ? "100ml" : "100g"} + משקל אריזה. באריזה: אם לא ממלאים יחידות/משקל יחידה — זה נחשב "יחידה 1" (האריזה כולה).
          </p>
        </header>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
          <label className="flex items-center gap-3 text-sm text-white">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-white/30 bg-black/40"
              checked={isInternal}
              onChange={(e) => {
                const next = e.target.checked;
                setIsInternal(next);
                if (next) setInternalId(newInternalId());
                setUsageTags(next ? ["ingredient"] : ["ready"]);
                setDefaultMeasure(next ? "g100" : "unit");
                setCommonMeasures(next ? ["g100", "unit"] : ["unit", "g100"]);
              }}
            />
            פריט ללא ברקוד (ירקות/בישול ביתי)
          </label>

          {!isInternal ? (
            <div className="space-y-2">
              <Field
                label="ברקוד"
                value={barcodeRaw}
                onChange={setBarcodeRaw}
                inputMode="numeric"
                placeholder="סרקי או הדביקי"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setScannerOpen(true)}
                  className="min-h-[44px] flex-1 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
                >
                  סרוק ברקוד
                </button>
                <div className="flex min-w-[9rem] items-center justify-center rounded-xl border border-white/10 bg-black/30 px-3 text-xs text-ink-muted">
                  {barcodeDigits ? `מנורמל: ${barcodeDigits}` : "—"}
                </div>
              </div>
              {existingByBarcode && existingBarcodeDismissed !== barcodeDigits ? (
                <div className="rounded-xl border border-amber-400/30 bg-amber-500/10 px-3 py-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-semibold text-amber-100">המוצר כבר קיים במאגר.</p>
                    <button
                      type="button"
                      className="rounded-md border border-white/15 bg-transparent px-2 py-1 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                      onClick={() => setExistingBarcodeDismissed(barcodeDigits || null)}
                      aria-label="סגור"
                    >
                      סגור
                    </button>
                  </div>
                  <p className="mt-1 text-[11px] text-amber-100/90">
                    {existingByBarcode.name}
                    {existingByBarcode.brand ? ` · ${existingByBarcode.brand}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/90 hover:border-white/25"
                      onClick={() => navigate(`/catalog?edit=${encodeURIComponent(existingByBarcode.id)}`)}
                    >
                      פתח במאגר
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          ) : (
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">מזהה פנימי</p>
              <p className="mt-1 font-mono text-xs text-white" dir="ltr">
                {internalId}
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 gap-3">
            <Field label="שם מוצר" value={name} onChange={setName} placeholder="למשל גבינת עמק 9%" />
            {showCatalogNameHint ? (
              <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2">
                <p className="text-[11px] font-semibold text-sky-50">ייתכן שכבר קיים במאגר:</p>
                <div className="mt-2 space-y-2">
                  {catalogNameMatches.map((p) => {
                    const checked = Boolean(catalogMatchCheckedIds[p.id]);
                    return (
                      <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-[11px] text-sky-100/90">
                          {p.name}
                          {p.brand ? ` · ${p.brand}` : ""}
                        </span>
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className="rounded-lg border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/90 hover:border-white/25"
                            onClick={() => navigate(`/catalog?edit=${encodeURIComponent(p.id)}`)}
                          >
                            פתח במאגר
                          </button>
                          <button
                            type="button"
                            disabled={checked}
                            className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white disabled:opacity-60"
                            onClick={() => setCatalogMatchCheckedIds((prev) => ({ ...prev, [p.id]: true }))}
                          >
                            {checked ? "נבדק" : "נבדק ✔"}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                    onClick={() => {
                      if (!catalogMatchSig) return;
                      setCatalogMatchIgnoredSig(catalogMatchSig);
                    }}
                  >
                    התעלם
                  </button>
                </div>
              </div>
            ) : null}
            <Field
              label="שם קצר ליומן (אופציונלי)"
              value={shortName}
              onChange={setShortName}
              placeholder="למשל עמק 9%"
            />
            <Field label="מותג" value={brand} onChange={setBrand} placeholder="למשל תנובה" />
            <Field label="קטגוריה" value={category} onChange={setCategory} placeholder="למשל שימורים" />
            <Field
              label="מילות חיפוש נוספות (מופרד בפסיק)"
              value={keywordsRaw}
              onChange={setKeywordsRaw}
              placeholder="למשל גבינה צהובה, עמק, 9 אחוז"
            />
            {verifiedPicked ? (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                <span className="text-[11px] font-semibold text-emerald-50">
                  ✓ נבחרה התאמה מהמאגר המאומת
                </span>
                {!isAlreadyInCatalog ? (
                  <button
                    type="button"
                    className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[11px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                    onClick={() => {
                      setVerifiedPicked(false);
                      setVerifiedPickedSig(null);
                    }}
                  >
                    הצג עוד הצעות
                  </button>
                ) : null}
              </div>
            ) : null}
            {visibleVerifiedSuggestions.length > 0 ? (
              <div className="rounded-xl border border-emerald-400/25 bg-emerald-500/10 px-3 py-2">
                <p className="text-[11px] text-emerald-100/90">הצעות מהמאגר המאומת (למילוי 100g):</p>
                <div className="mt-2 space-y-2">
                  {visibleVerifiedSuggestions.map((sug, idx) => (
                    <div
                      key={`${sug.name}|${sug.brand ?? ""}|${verifiedOffset + idx}`}
                      className="flex flex-wrap items-center gap-2"
                    >
                      <button
                        type="button"
                        className="rounded-lg bg-emerald-400/15 px-3 py-1.5 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/20"
                        onClick={() => {
                        setVerifiedPicked(true);
                        setVerifiedPickedSig(
                          `${sug.name.trim()}|${(sug.brand ?? "").trim()}|${keywordsRaw.trim()}|${(sug.category ?? "").trim()}`,
                        );
                        setName(sug.name);
                        setShortName((prev) => (prev.trim() ? prev : sug.name));
                        if (sug.brand) setBrand(sug.brand);
                        if (sug.category) setCategory(sug.category);
                          if (sug.calories100 != null) setKcal100(String(sug.calories100));
                          if (sug.protein100 != null) setProt100(String(sug.protein100));
                          if (sug.carbs100 != null) setCarb100(String(sug.carbs100));
                          if (sug.fat100 != null) setFat100(String(sug.fat100));
                          setVerifiedSuggestions([]);
                          setVerifiedOffset(0);
                        }}
                      >
                        ✓ בחר
                      </button>
                      <span className="text-[11px] text-emerald-100/90">
                        {sug.name}
                        {sug.brand ? ` · ${sug.brand}` : ""}
                      {sug.category ? ` · ${sug.category}` : ""}
                        {sug.calories100 != null ? ` · ${sug.calories100} קק\"ל` : ""}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {verifiedOffset + 4 < verifiedSuggestions.length ? (
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                      onClick={() => setVerifiedOffset((o) => Math.min(verifiedSuggestions.length, o + 4))}
                    >
                      לא מתאים — עוד הצעות
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-xs font-semibold text-ink-muted hover:border-white/25 hover:text-white"
                      onClick={() => {
                        setVerifiedSuggestions([]);
                        setVerifiedOffset(0);
                      }}
                    >
                      התעלם
                    </button>
                  )}
                </div>
                <p className="mt-2 text-[11px] text-ink-dim">
                  שם כללי עלול להתאים למוצר אחר — עדיף לבחור ידנית.
                </p>
              </div>
            ) : (
              <p className="text-[11px] text-ink-dim">
                המאגר המאומת מציע התאמות לפי שם/מותג/מילות חיפוש. כדי למלא — בחרי הצעה.
              </p>
            )}
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-muted">סוג שימוש</p>
              <div className="flex flex-wrap gap-2">
                {USAGE_OPTIONS.map((opt) => {
                  const active = usageTags.includes(opt.id);
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() =>
                        setUsageTags((prev) =>
                          prev.includes(opt.id)
                            ? prev.filter((x) => x !== opt.id)
                            : [...prev, opt.id],
                        )
                      }
                      className={
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border border-emerald-300/30 bg-emerald-500/15 text-emerald-50"
                          : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-ink-dim">
                אפשר לבחור כמה. ברירת מחדל: {isInternal ? "חומר גלם" : "מוכן"}.
              </p>
            </div>
            <div className="space-y-1.5">
              <p className="text-xs font-medium text-ink-muted">ברירת מחדל ביומן</p>
              <div className="flex flex-wrap gap-2">
                {MEASURE_OPTIONS.map((opt) => {
                  const active = defaultMeasure === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => {
                        setDefaultMeasure(opt.id);
                        setCommonMeasures((prev) => {
                          const next = prev.includes(opt.id) ? prev : [opt.id, ...prev];
                          return next.slice(0, 4);
                        });
                      }}
                      className={
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border border-sky-300/30 bg-sky-500/15 text-sky-50"
                          : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="mt-2 text-xs font-medium text-ink-muted">מידות נפוצות (ליומן)</p>
              <div className="flex flex-wrap gap-2">
                {MEASURE_OPTIONS.map((opt) => {
                  const active = commonMeasures.includes(opt.id);
                  return (
                    <button
                      key={`cm-${opt.id}`}
                      type="button"
                      onClick={() =>
                        setCommonMeasures((prev) => {
                          const next = prev.includes(opt.id)
                            ? prev.filter((x) => x !== opt.id)
                            : [...prev, opt.id];
                          // Keep default measure always included
                          const withDefault = next.includes(defaultMeasure)
                            ? next
                            : [defaultMeasure, ...next];
                          return withDefault.slice(0, 4);
                        })
                      }
                      className={
                        "rounded-full px-3 py-1.5 text-xs font-semibold transition " +
                        (active
                          ? "border border-white/20 bg-white/[0.12] text-white"
                          : "border border-white/15 bg-white/[0.06] text-ink-muted hover:border-white/25 hover:text-white")
                      }
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
              <p className="text-[11px] leading-snug text-ink-dim">
                ביומן יוצגו הכפתורים לפי “מידות נפוצות”. מומלץ 2–4.
              </p>
            </div>
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold text-white">
              {per100Basis === "ml" ? "ל־100 מ״ל" : "ל־100 גרם"}
            </p>
            <div className="flex items-center gap-2 text-xs" dir="rtl">
              <span className={per100Basis === "g" ? "text-white" : "text-ink-muted"}>100g</span>
              <button
                type="button"
                onClick={() => setPer100Basis((x) => (x === "g" ? "ml" : "g"))}
                className="rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 font-semibold text-ink-muted hover:border-white/25 hover:text-white"
              >
                {per100Basis === "ml" ? "ערכים לפי מ״ל" : "ערכים לפי גרם"}
              </button>
              <span className={per100Basis === "ml" ? "text-white" : "text-ink-muted"}>100ml</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label='קלוריות (קק"ל)' value={kcal100} onChange={setKcal100} inputMode="decimal" />
            <Field label="חלבון (g)" value={prot100} onChange={setProt100} inputMode="decimal" />
            <Field label="פחמימה (g)" value={carb100} onChange={setCarb100} inputMode="decimal" />
            <Field label="שומן (g)" value={fat100} onChange={setFat100} inputMode="decimal" />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-white">אריזה</p>
          <div className="grid grid-cols-1 gap-3">
            <Field
              label={per100Basis === "ml" ? "נפח כולל של האריזה (מ״ל)" : "משקל כולל של האריזה (גרם)"}
              value={totalWeightG}
              onChange={(v) => {
                setTotalWeightG(v);
              }}
              inputMode="decimal"
              placeholder="למשל 400"
            />
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="יחידות באריזה"
                value={unitsPerPack}
                onChange={(v) => {
                  lastPackEditRef.current = "units";
                  setUnitsPerPack(v);
                  window.setTimeout(() => {
                    if (lastPackEditRef.current === "units") lastPackEditRef.current = null;
                  }, 0);
                }}
                inputMode="decimal"
                placeholder="למשל 4"
              />
              <Field
                label={per100Basis === "ml" ? "נפח יחידה (מ״ל)" : "משקל יחידה (גרם)"}
                value={unitWeightG}
                onChange={(v) => {
                  lastPackEditRef.current = "unitWeight";
                  setUnitWeightG(v);
                  window.setTimeout(() => {
                    if (lastPackEditRef.current === "unitWeight") lastPackEditRef.current = null;
                  }, 0);
                }}
                inputMode="decimal"
                placeholder="למשל 100"
              />
            </div>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-xs text-ink-muted">
            {per100Basis === "ml"
              ? "נפח יחידה מחושב לפי (נפח כולל ÷ יחידות) (או להפך)."
              : "משקל יחידה מחושב לפי (משקל כולל ÷ יחידות) (או להפך)."}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-white">מידות (אופציונלי)</p>
          <p className="text-[11px] leading-snug text-ink-dim">
            הכי נוח: שקלי/מדדי פעם אחת כמה {per100Basis === "ml" ? "מ״ל" : "גרם"} יש בכף/כפית/כוס, והאפליקציה תחושב אוטומטית.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label={per100Basis === "ml" ? "מ״ל בכוס (סטנדרט)" : "גרם בכוס (סטנדרט)"}
              value={
                (() => {
                  const n = parseNum(cupsPer100g);
                  if (!(n > 0)) return "";
                  const per = 100 / n;
                  return Number.isFinite(per) ? fmt1(per) : "";
                })()
              }
              onChange={(v) => {
                const per = parseNum(v);
                if (!(per > 0)) {
                  setCupsPer100g("");
                  return;
                }
                setCupsPer100g(String(100 / per));
              }}
              inputMode="decimal"
            />
            <Field
              label={per100Basis === "ml" ? "מ״ל בכף" : "גרם בכף"}
              value={
                (() => {
                  const n = parseNum(tbspPer100g);
                  if (!(n > 0)) return "";
                  const per = 100 / n;
                  return Number.isFinite(per) ? fmt1(per) : "";
                })()
              }
              onChange={(v) => {
                const per = parseNum(v);
                if (!(per > 0)) {
                  setTbspPer100g("");
                  return;
                }
                setTbspPer100g(String(100 / per));
              }}
              inputMode="decimal"
            />
            <Field
              label={per100Basis === "ml" ? "מ״ל בכפית" : "גרם בכפית"}
              value={
                (() => {
                  const n = parseNum(tspPer100g);
                  if (!(n > 0)) return "";
                  const per = 100 / n;
                  return Number.isFinite(per) ? fmt1(per) : "";
                })()
              }
              onChange={(v) => {
                const per = parseNum(v);
                if (!(per > 0)) {
                  setTspPer100g("");
                  return;
                }
                setTspPer100g(String(100 / per));
              }}
              inputMode="decimal"
            />
            <Field
              label={per100Basis === "ml" ? "מ״ל ליחידה (אם רלוונטי)" : "גרם ליחידה (אם רלוונטי)"}
              value={
                (() => {
                  const n = parseNum(unitsPer100g);
                  if (!(n > 0)) return "";
                  const per = 100 / n;
                  return Number.isFinite(per) ? fmt1(per) : "";
                })()
              }
              onChange={(v) => {
                const per = parseNum(v);
                if (!(per > 0)) {
                  setUnitsPer100g("");
                  return;
                }
                setUnitsPer100g(String(100 / per));
              }}
              inputMode="decimal"
            />
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
          <p className="text-sm font-semibold text-white">צעדים לקיזוז (MET {WALKING_MET})</p>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">ל־100g</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(per100.calories)}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">ליחידה (אריזה)</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(kcalFor(gramsPer.gUnit))}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">לכף</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(kcalFor(gramsPer.gTbsp))}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">לכפית</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(kcalFor(gramsPer.gTsp))}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">לכוס</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(kcalFor(gramsPer.gCup))}
              </p>
            </div>
            <div className="rounded-xl border border-white/10 bg-black/30 px-3 py-2">
              <p className="text-xs text-ink-muted">ליחידה (לפי 100g)</p>
              <p className="mt-1 font-medium tabular-nums text-white">
                {stepsFor(kcalFor(gramsPer.gPiece))}
              </p>
            </div>
          </div>
          <p className="text-[11px] text-ink-dim">
            אם צעדים יוצאים “—” לרוב חסר משקל גוף ב־הגדרות, או שחסר מידע על המידה (גרמים).
          </p>
        </section>

        {error ? (
          <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3">
            <p className="text-sm text-red-200">{error}</p>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void handleSave()}
          className="min-h-[52px] w-full rounded-2xl bg-white text-base font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
        >
          שמור מוצר למאגר
        </button>
      </div>

      {scannerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex flex-col bg-black text-white"
              role="dialog"
              aria-modal="true"
              aria-labelledby="barcode-fullscreen-title"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p id="barcode-fullscreen-title" className="min-w-0 text-lg font-semibold tracking-tight">
                  סריקת ברקוד
                </p>
                <button
                  type="button"
                  onClick={() => setScannerOpen(false)}
                  className="shrink-0 rounded-xl border border-white/20 bg-white/10 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-white/15 active:scale-[0.98]"
                >
                  סגור
                </button>
              </header>
              <div className="flex min-h-0 flex-1 flex-col items-stretch px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4">
                <p className="mb-3 text-center text-sm text-white/65">
                  כוונו את הברקוד למסגרת — הסריקה תתבצע אוטומטית
                </p>
                <div className="mx-auto flex min-h-0 w-full max-w-lg flex-1 flex-col">
                  <BarcodeScanner
                    isActive
                    mode="fullscreen"
                    onScan={(code) => {
                      setBarcodeRaw(code);
                      setScannerOpen(false);
                    }}
                  />
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

