import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { BarcodeScanner } from "../components/BarcodeScanner";
import {
  VerifiedSuggestionsCollapsible,
  type VerifiedSuggestionPick,
} from "../components/VerifiedSuggestionsCollapsible";
import { useAuth } from "../context/AuthContext";
import type { CatalogProduct } from "../context/CatalogContext";
import { useCatalog } from "../context/CatalogContext";
import { useVerified100 } from "../context/Verified100Context";
import { useOffBarcodeLookup } from "../hooks/useOffBarcodeLookup";
import { fmt1, parseNum } from "../utils/number";
import { normalizeBarcode } from "../utils/openFoodFacts";
import { verifiedRowToPickPortions } from "../utils/verifiedMeasures";
import { useToast } from "../context/ToastContext";
import { VoiceDictationWizard } from "../components/VoiceDictationWizard";
import {
  nutritionVoiceSteps,
  PRODUCT_IDENTITY_VOICE_STEPS,
} from "../constants/voiceWizardSteps";

type MeasureKey = "unit" | "tbsp" | "tsp" | "cup" | "g100";
type UsageTag = "ready" | "ingredient" | "raw" | "cooked" | "dry";

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
      <span className="text-sm font-medium text-ink-muted">{label}</span>
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

function applyCatalogProductToForm(
  p: CatalogProduct,
  setters: {
    setName: (v: string) => void;
    setShortName: (v: string) => void;
    setBrand: (v: string) => void;
    setCategory: (v: string) => void;
    setKeywordsRaw: (v: string) => void;
    setPer100Basis: (v: "g" | "ml") => void;
    setKcal100: (v: string) => void;
    setProt100: (v: string) => void;
    setCarb100: (v: string) => void;
    setFat100: (v: string) => void;
    setTotalWeightG: (v: string) => void;
    setUnitsPerPack: (v: string) => void;
    setUnitWeightG: (v: string) => void;
    setUsageTags: (v: UsageTag[]) => void;
    setDefaultMeasure: (v: MeasureKey) => void;
    setCommonMeasures: (v: MeasureKey[]) => void;
  },
) {
  setters.setName(p.name);
  setters.setShortName(p.shortName?.trim() ?? "");
  setters.setBrand(p.brand ?? "");
  setters.setCategory(p.category ?? "");
  setters.setKeywordsRaw(p.keywords?.join(", ") ?? "");
  setters.setPer100Basis(p.per100Basis === "ml" ? "ml" : "g");
  const n = p.nutrition?.per100g;
  setters.setKcal100(n?.calories != null && Number.isFinite(n.calories) ? String(n.calories) : "");
  setters.setProt100(n?.proteinG != null && Number.isFinite(n.proteinG) ? String(n.proteinG) : "");
  setters.setCarb100(n?.carbsG != null && Number.isFinite(n.carbsG) ? String(n.carbsG) : "");
  setters.setFat100(n?.fatG != null && Number.isFinite(n.fatG) ? String(n.fatG) : "");
  const pkg = p.package;
  setters.setTotalWeightG(
    pkg?.totalWeightG != null && pkg.totalWeightG > 0 ? fmt1(pkg.totalWeightG) : "",
  );
  setters.setUnitsPerPack(
    pkg?.unitsPerPack != null && pkg.unitsPerPack > 0 ? String(pkg.unitsPerPack) : "",
  );
  setters.setUnitWeightG(
    pkg?.unitWeightG != null && pkg.unitWeightG > 0 ? fmt1(pkg.unitWeightG) : "",
  );
  if (p.usageTags?.length) setters.setUsageTags(p.usageTags as UsageTag[]);
  if (p.defaultMeasure) setters.setDefaultMeasure(p.defaultMeasure as MeasureKey);
  if (p.commonMeasures?.length) {
    setters.setCommonMeasures(p.commonMeasures.slice(0, 4) as MeasureKey[]);
  }
}

export function SupermarketQuickFill() {
  const navigate = useNavigate();
  const location = useLocation();
  const { tripId } = useParams<{ tripId: string }>();
  const { user } = useAuth();
  const { catalog, supermarketTrips, supermarketTripsReady, addSupermarketDraft } = useCatalog();
  const { findScoredMatches, items: verifiedItems } = useVerified100();
  const { showToast } = useToast();

  const locState = (location.state as { tripName?: string; tripCategory?: string } | null) ?? null;

  const trip = useMemo(
    () => supermarketTrips.find((t) => t.id === tripId) ?? null,
    [supermarketTrips, tripId],
  );

  const tripMeta = useMemo(() => {
    if (trip) return { name: trip.name, category: trip.category };
    if (locState?.tripName && locState?.tripCategory) {
      return { name: locState.tripName, category: locState.tripCategory };
    }
    return null;
  }, [trip, locState?.tripCategory, locState?.tripName]);

  const [barcodeRaw, setBarcodeRaw] = useState("");
  const barcodeDigits = useMemo(() => normalizeBarcode(barcodeRaw), [barcodeRaw]);

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [brand, setBrand] = useState("");
  const [category, setCategory] = useState("");
  const [keywordsRaw, setKeywordsRaw] = useState("");
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
  const [verifiedSuggestions, setVerifiedSuggestions] = useState<VerifiedSuggestionPick[]>([]);
  const [verifiedOffset, setVerifiedOffset] = useState(0);

  const [catalogMatchIgnoredSig, setCatalogMatchIgnoredSig] = useState<string | null>(null);
  const [catalogMatchCheckedIds, setCatalogMatchCheckedIds] = useState<Record<string, true>>({});

  const catalogNameMatches = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 4) return [];
    const sig = `${q}|${brand.trim().toLowerCase()}||`;
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
  }, [brand, catalog, catalogMatchIgnoredSig, name]);

  const catalogMatchSig = useMemo(() => {
    const q = name.trim().toLowerCase();
    if (q.length < 4) return null;
    return `${q}|${brand.trim().toLowerCase()}||`;
  }, [brand, name]);

  const showCatalogNameHint = catalogNameMatches.length > 0;

  const [totalWeightG, setTotalWeightG] = useState("");
  const [unitsPerPack, setUnitsPerPack] = useState("");
  const [unitWeightG, setUnitWeightG] = useState("");
  const lastPackEditRef = useRef<"units" | "unitWeight" | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [scannerOpen, setScannerOpen] = useState(false);
  const [identityVoiceOpen, setIdentityVoiceOpen] = useState(false);
  const [nutritionVoiceOpen, setNutritionVoiceOpen] = useState(false);

  const nutritionVoiceStepList = useMemo(
    () => nutritionVoiceSteps(per100Basis),
    [per100Basis],
  );

  const applyIdentityVoice = useCallback((stepId: string, value: string) => {
    switch (stepId) {
      case "name":
        setName(value);
        break;
      case "shortName":
        setShortName(value);
        break;
      case "brand":
        setBrand(value);
        break;
      case "category":
        setCategory(value);
        break;
      case "keywords":
        setKeywordsRaw(value);
        break;
      default:
        break;
    }
  }, []);

  const applyNutritionVoice = useCallback((stepId: string, value: string) => {
    switch (stepId) {
      case "kcal100":
        setKcal100(value);
        break;
      case "prot100":
        setProt100(value);
        break;
      case "carb100":
        setCarb100(value);
        break;
      case "fat100":
        setFat100(value);
        break;
      case "totalWeightG":
        setTotalWeightG(value);
        break;
      case "unitsPerPack":
        lastPackEditRef.current = "units";
        setUnitsPerPack(value);
        break;
      case "unitWeightG":
        lastPackEditRef.current = "unitWeight";
        setUnitWeightG(value);
        break;
      default:
        break;
    }
  }, []);

  useEffect(() => {
    if (!scannerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [scannerOpen]);

  const isAlreadyInCatalog = useMemo(() => {
    if (!barcodeDigits) return false;
    return catalog.some((p) => p.id === barcodeDigits || p.gtin === barcodeDigits);
  }, [barcodeDigits, catalog]);

  const { offLoading } = useOffBarcodeLookup({
    barcodeDigits,
    enabled: Boolean(user),
    skipLookup: isAlreadyInCatalog,
    verifiedItems,
    setters: {
      setName,
      setBrand,
      setCategory,
      setPer100Basis,
      setKcal100,
      setProt100,
      setCarb100,
      setFat100,
      setTotalWeightG,
      setUnitsPerPack,
      setUnitWeightG,
      setVerifiedPicked,
      setVerifiedPickedSig,
    },
  });

  useEffect(() => {
    if (per100Basis === "ml") {
      setVerifiedSuggestions([]);
      setVerifiedOffset(0);
      return;
    }
    const sig = `${name.trim()}|${brand.trim()}||`;
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
    const qName = n;
    const scored = findScoredMatches(
      { name: qName, brand: brand.trim() || undefined },
      { limit: 12, source: "tsv" },
    );
    setVerifiedSuggestions(
      scored.map(({ item: m, score }) => ({
        name: m.name,
        brand: m.brand,
        category: m.category,
        calories100: m.calories100,
        protein100: m.protein100,
        carbs100: m.carbs100,
        fat100: m.fat100,
        unitWeightG: m.unitWeightG,
        packWeightG: m.packWeightG,
        unitsPerPack: m.unitsPerPack,
        measures: m.measures,
        matchScore: score,
        ...verifiedRowToPickPortions(m),
      })),
    );
    setVerifiedOffset(0);
  }, [name, brand, findScoredMatches, verifiedPickedSig, isAlreadyInCatalog, per100Basis]);

  const visibleVerifiedSuggestions = useMemo(
    () => verifiedSuggestions.slice(verifiedOffset, verifiedOffset + 4),
    [verifiedSuggestions, verifiedOffset],
  );

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

  const applyFromCatalog = useCallback(
    (p: CatalogProduct) => {
      applyCatalogProductToForm(p, {
        setName,
        setShortName,
        setBrand,
        setCategory,
        setKeywordsRaw,
        setPer100Basis,
        setKcal100,
        setProt100,
        setCarb100,
        setFat100,
        setTotalWeightG,
        setUnitsPerPack,
        setUnitWeightG,
        setUsageTags,
        setDefaultMeasure,
        setCommonMeasures,
      });
    },
    [],
  );

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

  function resetFormForNext() {
    setBarcodeRaw("");
    setName("");
    setShortName("");
    setBrand("");
    setCategory("");
    setKeywordsRaw("");
    setUsageTags(["ready"]);
    setDefaultMeasure("unit");
    setCommonMeasures(["unit", "g100"]);
    setPer100Basis("g");
    setKcal100("");
    setProt100("");
    setCarb100("");
    setFat100("");
    setVerifiedPicked(false);
    setVerifiedPickedSig(null);
    setVerifiedSuggestions([]);
    setVerifiedOffset(0);
    setCatalogMatchIgnoredSig(null);
    setCatalogMatchCheckedIds({});
    setTotalWeightG("");
    setUnitsPerPack("");
    setUnitWeightG("");
    setError(null);
  }

  async function handleSaveDraft() {
    setError(null);
    if (!user || !tripId || !tripMeta) {
      setError("חסר מעבר או התחברות.");
      return;
    }
    const n = name.trim();
    if (n.length < 2) {
      setError("נא להזין שם מוצר.");
      return;
    }
    const bc = barcodeDigits;
    if (!bc || bc.length < 8) {
      setError("ברקוד לא תקין (חייב לפחות 8 ספרות).");
      return;
    }
    const totalW = pkg.totalW ?? pkg.unitW;
    if (!totalW) {
      setError(per100Basis === "ml" ? "נא להזין נפח כולל של האריזה." : "נא להזין משקל כולל של האריזה.");
      return;
    }
    const units = pkg.units;
    const unitW = pkg.unitW;
    const inferredUnitsPerPack = units ?? (unitW ? totalW / unitW : 1);
    const inferredUnitWeightG =
      unitW ?? (inferredUnitsPerPack > 0 ? totalW / inferredUnitsPerPack : undefined);

    await addSupermarketDraft({
      tripId,
      tripNameSnapshot: tripMeta.name,
      tripCategorySnapshot: tripMeta.category,
      barcodeRaw,
      isInternal: false,
      name: n,
      shortName: shortName.trim() || undefined,
      brand: brand.trim() || undefined,
      keywordsRaw: keywordsRaw.trim() || undefined,
      category: category.trim() || undefined,
      usageTags: usageTags.length ? usageTags : undefined,
      defaultMeasure,
      commonMeasures,
      per100Basis,
      calories100: per100.calories,
      protein100: per100.proteinG,
      carbs100: per100.carbsG,
      fat100: per100.fatG,
      totalWeightG: totalW,
      unitsPerPack: inferredUnitsPerPack,
      unitWeightG:
        inferredUnitWeightG != null && Number.isFinite(inferredUnitWeightG)
          ? inferredUnitWeightG
          : undefined,
    });
    resetFormForNext();
  }

  if (!tripId) {
    return (
      <p className="text-sm text-ink-muted">
        כתובת לא תקינה.{" "}
        <button type="button" className="text-sky-300 underline" onClick={() => navigate("/supermarket")}>
          חזרה
        </button>
      </p>
    );
  }

  if (user && supermarketTripsReady && tripId && !tripMeta) {
    return (
      <div className="space-y-4">
        <p className="text-sm text-ink-muted">המעבר לא נמצא (אולי נמחק).</p>
        <button
          type="button"
          onClick={() => navigate("/supermarket")}
          className="rounded-xl border border-white/15 px-4 py-2 text-sm font-semibold text-white"
        >
          מעבר חדש
        </button>
      </div>
    );
  }

  const showLoadingTrip = user && tripId && !tripMeta && !supermarketTripsReady;
  return (
    <>
      <div className="space-y-6 pb-4">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <p className="font-display text-xl font-semibold tracking-tight text-white sm:text-2xl">מילוי מהיר</p>
            <div className="flex w-full gap-2 sm:w-auto sm:shrink-0">
              <button
                type="button"
                onClick={() => navigate("/supermarket")}
                className="min-h-[44px] touch-manipulation flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-white transition hover:border-white/25 hover:bg-white/[0.06] active:scale-[0.99] sm:flex-none sm:px-4"
              >
                מעבר אחר
              </button>
              <button
                type="button"
                onClick={() => navigate("/")}
                className="min-h-[44px] touch-manipulation flex-1 rounded-xl border border-white/15 px-3 py-2 text-sm font-semibold text-ink-muted transition hover:text-white active:scale-[0.99] sm:flex-none sm:px-4"
              >
                בית
              </button>
            </div>
          </div>
          {tripMeta ? (
            <>
              <p className="break-words text-sm text-ink-muted">
                מעבר: <span className="text-white">{tripMeta.name}</span> · {tripMeta.category}
              </p>
              <p className="text-sm leading-relaxed text-ink-dim">
                אחרי לחיצה על &quot;שמור והמשך&quot; המוצר נשמר לעריכה מאוחרת והטופס מתרוקן — אותו מעבר ואותה קטגוריה, מוצר נוסף.
              </p>
            </>
          ) : showLoadingTrip ? (
            <p className="text-sm text-ink-muted">טוען פרטי מעבר…</p>
          ) : null}
        </header>

        {!user ? (
          <p className="text-sm text-ink-muted">התחברי כדי למלא מוצרים.</p>
        ) : !tripMeta ? (
          <p className="text-sm text-ink-muted">{showLoadingTrip ? "טוען…" : "—"}</p>
        ) : (
          <>
            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-4">
              <div className="space-y-2">
                <Field label="ברקוד" value={barcodeRaw} onChange={setBarcodeRaw} inputMode="numeric" placeholder="סרקי או הדביקי" />
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setScannerOpen(true)}
                    className="min-h-[44px] touch-manipulation flex-1 rounded-xl bg-white text-sm font-semibold text-black transition hover:bg-neutral-200 active:scale-[0.99]"
                  >
                    סרוק ברקוד
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setNutritionVoiceOpen(false);
                      setIdentityVoiceOpen(true);
                    }}
                    className="min-h-[44px] touch-manipulation flex-1 rounded-xl border border-emerald-400/35 bg-emerald-500/15 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25 active:scale-[0.99]"
                  >
                    🎤 פרטי מוצר
                  </button>
                </div>
                <div className="flex min-h-[44px] items-center justify-center rounded-xl border border-white/10 bg-black/30 px-3 py-2 text-sm text-ink-muted">
                    <span className="truncate" dir="ltr" title={barcodeDigits || undefined}>
                      {offLoading
                        ? "טוען OFF…"
                        : barcodeDigits
                          ? `מנורמל: ${barcodeDigits}`
                          : "—"}
                    </span>
                </div>
              </div>

              <Field label="שם מוצר" value={name} onChange={setName} placeholder="למשל חלב 3%" />
              <Field label="מותג" value={brand} onChange={setBrand} placeholder="למשל תנובה" />

              {showCatalogNameHint ? (
                <div className="rounded-xl border border-sky-400/25 bg-sky-500/10 px-3 py-2">
                  <p className="text-[14px] font-semibold text-sky-50">ייתכן שכבר קיים במאגר שלך:</p>
                  <div className="mt-2 space-y-2">
                    {catalogNameMatches.map((p) => {
                      const checked = Boolean(catalogMatchCheckedIds[p.id]);
                      return (
                        <div key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-[14px] text-sky-100/90">
                            {p.name}
                            {p.brand ? ` · ${p.brand}` : ""}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              className="rounded-lg border border-white/15 bg-emerald-500/20 px-3 py-1.5 text-[14px] font-semibold text-emerald-50 hover:border-white/25"
                              onClick={() => applyFromCatalog(p)}
                            >
                              מלא מהמאגר
                            </button>
                            <button
                              type="button"
                              disabled={checked}
                              className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[14px] font-semibold text-ink-muted hover:border-white/25 hover:text-white disabled:opacity-60"
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
                      className="rounded-lg border border-white/15 bg-transparent px-3 py-1.5 text-[14px] font-semibold text-ink-muted hover:border-white/25 hover:text-white"
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

              <VerifiedSuggestionsCollapsible
                suggestions={verifiedSuggestions}
                visibleSuggestions={visibleVerifiedSuggestions}
                verifiedOffset={verifiedOffset}
                verifiedPicked={verifiedPicked}
                isAlreadyInCatalog={isAlreadyInCatalog}
                onPick={(sug) => {
                  setVerifiedPicked(true);
                  setVerifiedPickedSig(`${sug.name.trim()}|${(sug.brand ?? "").trim()}||`);
                  setName(sug.name);
                  setShortName((prev) => (prev.trim() ? prev : sug.name));
                  if (sug.brand) setBrand(sug.brand);
                  if (sug.category) setCategory(sug.category);
                  if (sug.calories100 != null) setKcal100(String(sug.calories100));
                  if (sug.protein100 != null) setProt100(String(sug.protein100));
                  if (sug.carbs100 != null) setCarb100(String(sug.carbs100));
                  if (sug.fat100 != null) setFat100(String(sug.fat100));
                  const portions = verifiedRowToPickPortions(sug);
                  if (portions.unitWeightG != null) setUnitWeightG(fmt1(portions.unitWeightG));
                  if (portions.packWeightG != null) setTotalWeightG(fmt1(portions.packWeightG));
                  if (portions.unitsPerPack != null) setUnitsPerPack(String(portions.unitsPerPack));
                  if (portions.commonMeasures?.length) {
                    setCommonMeasures(portions.commonMeasures.slice(0, 4) as MeasureKey[]);
                  }
                  if (portions.defaultMeasure) setDefaultMeasure(portions.defaultMeasure as MeasureKey);
                  setVerifiedSuggestions([]);
                  setVerifiedOffset(0);
                }}
                onMore={() =>
                  setVerifiedOffset((o) => Math.min(verifiedSuggestions.length, o + 4))
                }
                onDismiss={() => {
                  setVerifiedSuggestions([]);
                  setVerifiedOffset(0);
                }}
                onClearPicked={() => {
                  setVerifiedPicked(false);
                  setVerifiedPickedSig(null);
                }}
              />
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{per100Basis === "ml" ? "ל־100 מ״ל" : "ל־100 גרם"}</p>
                <button
                  type="button"
                  onClick={() => {
                    setIdentityVoiceOpen(false);
                    setNutritionVoiceOpen(true);
                  }}
                  className="min-h-[40px] rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-3 text-sm font-semibold text-emerald-50 transition hover:bg-emerald-500/25"
                >
                  🎤 תזונה ואריזה
                </button>
                <div className="flex items-center gap-2 text-sm" dir="rtl">
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
            </section>

            {error ? (
              <div className="rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3">
                <p className="text-sm text-red-200">{error}</p>
              </div>
            ) : null}

            <button
              type="button"
              onClick={() => void handleSaveDraft()}
              className="min-h-[52px] w-full touch-manipulation rounded-2xl border border-white/20 bg-white/[0.08] px-4 py-3 text-center text-sm font-semibold leading-snug text-white transition hover:bg-white/[0.12] active:scale-[0.99] sm:text-base"
            >
              שמור והמשך למוצר נוסף
            </button>
          </>
        )}
      </div>

      <VoiceDictationWizard
        open={identityVoiceOpen}
        title="מילוי קולי — פרטי מוצר"
        steps={PRODUCT_IDENTITY_VOICE_STEPS}
        onClose={() => setIdentityVoiceOpen(false)}
        onApply={applyIdentityVoice}
        onFinish={() => showToast("פרטי מוצר מולאו בקול", "success")}
      />
      <VoiceDictationWizard
        open={nutritionVoiceOpen}
        title="מילוי קולי — תזונה ואריזה"
        steps={nutritionVoiceStepList}
        onClose={() => setNutritionVoiceOpen(false)}
        onApply={applyNutritionVoice}
        onFinish={() => showToast("תזונה ואריזה מולאו בקול", "success")}
      />

      {scannerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex flex-col bg-black text-white"
              role="dialog"
              aria-modal="true"
              aria-labelledby="barcode-super-title"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p id="barcode-super-title" className="min-w-0 text-lg font-semibold tracking-tight">
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
                <p className="mb-3 text-center text-sm text-white/65">כוונו את הברקוד למסגרת</p>
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
