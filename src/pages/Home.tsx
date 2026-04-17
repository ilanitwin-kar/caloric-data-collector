import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { Spinner } from "../components/Spinner";
import { useProducts } from "../context/ProductsContext";
import { useVerified100 } from "../context/Verified100Context";
import {
  countParsedFields,
  parseNutritionFromOcrText,
  parsePackageFromOcrText,
  runLabelOcr,
  type ParsedMacros,
} from "../utils/labelOcr";
import { BarcodeScanner } from "../components/BarcodeScanner";
import {
  fetchOpenFoodFactsProduct,
  normalizeBarcode,
  searchOpenFoodFactsProducts,
  type OffSearchHit,
  type OpenFoodFactsProduct,
} from "../utils/openFoodFacts";
import type { Product } from "../types/product";
import { playSuccessChime } from "../utils/successChime";
import { useBodyWeightKg } from "../hooks/useBodyWeightKg";
import { fmt1, parseNum } from "../utils/number";
import { WALKING_MET, walkingStepsToBurnKcal } from "../utils/walkingBurn";

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M5 4v16M8 4v16M11 4v16M14 4v16M17 4v16M20 4v16" />
    </svg>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M6.827 6.175A2.31 2.31 0 0 1 9.17 4.5h5.66a2.31 2.31 0 0 1 2.343 1.675l.558 1.825H21a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5H3a1.5 1.5 0 0 1-1.5-1.5v-9A1.5 1.5 0 0 1 3 9.5h2.27l.557-1.325Z"
      />
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M12 17.25a4.25 4.25 0 1 0 0-8.5 4.25 4.25 0 0 0 0 8.5Z"
      />
    </svg>
  );
}

function formatMacroValue(n: number): string {
  const r = Math.round(n * 10) / 10;
  return Number.isInteger(r) ? String(r) : r.toFixed(1);
}

function applyMacrosToFields(
  p: ParsedMacros,
  setters: {
    setCals100: (v: string) => void;
    setProt100: (v: string) => void;
    setCarb100: (v: string) => void;
    setSugars100: (v: string) => void;
    setFat100: (v: string) => void;
    setSatFat100: (v: string) => void;
    setTransFat100: (v: string) => void;
    setFiber100: (v: string) => void;
    setSodiumMg100: (v: string) => void;
    setSugarTsp100: (v: string) => void;
  },
) {
  if (p.cals100 !== undefined) setters.setCals100(formatMacroValue(p.cals100));
  if (p.prot100 !== undefined) setters.setProt100(formatMacroValue(p.prot100));
  if (p.carb100 !== undefined) setters.setCarb100(formatMacroValue(p.carb100));
  if (p.sugars100 !== undefined) setters.setSugars100(formatMacroValue(p.sugars100));
  if (p.fat100 !== undefined) setters.setFat100(formatMacroValue(p.fat100));
  if (p.satFat100 !== undefined) setters.setSatFat100(formatMacroValue(p.satFat100));
  if (p.transFat100 !== undefined) setters.setTransFat100(formatMacroValue(p.transFat100));
  if (p.fiber100 !== undefined) setters.setFiber100(formatMacroValue(p.fiber100));
  if (p.sodiumMg100 !== undefined) setters.setSodiumMg100(formatMacroValue(p.sodiumMg100));
  if (p.sugarTeaspoons100 !== undefined) {
    setters.setSugarTsp100(formatMacroValue(p.sugarTeaspoons100));
  }
}

function Field({
  label,
  id,
  value,
  onChange,
  placeholder,
  inputMode,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  inputMode?: InputHTMLAttributes<HTMLInputElement>["inputMode"];
}) {
  return (
    <div className="space-y-2">
      <label
        htmlFor={id}
        className="block text-xs font-medium text-ink-muted"
      >
        {label}
      </label>
      <input
        id={id}
        name={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        inputMode={inputMode}
        autoComplete="off"
        className="min-h-[52px] w-full rounded-2xl border border-white/15 bg-white/[0.06] px-4 text-lg text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/20"
      />
    </div>
  );
}

type OcrUiState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; filled: number }
  | { status: "partial"; filled: number }
  | { status: "none" }
  | { status: "error"; message: string };

function pickLatestProductByBarcode(products: Product[], digits: string): Product | undefined {
  const matches = products.filter(
    (p) => p.barcode && normalizeBarcode(p.barcode) === digits,
  );
  if (matches.length === 0) return undefined;
  return [...matches].sort(
    (a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
  )[0];
}

export function Home() {
  const { addProduct, products } = useProducts();
  const { findBestMatch } = useVerified100();
  const bodyWeightKg = useBodyWeightKg();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [barcode, setBarcode] = useState("");
  const [cals100, setCals100] = useState("");
  const [prot100, setProt100] = useState("");
  const [carb100, setCarb100] = useState("");
  const [sugars100, setSugars100] = useState("");
  const [fat100, setFat100] = useState("");
  const [satFat100, setSatFat100] = useState("");
  const [transFat100, setTransFat100] = useState("");
  const [fiber100, setFiber100] = useState("");
  const [sodiumMg100, setSodiumMg100] = useState("");
  const [sugarTsp100, setSugarTsp100] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [units, setUnits] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [verifiedCandidate, setVerifiedCandidate] = useState<null | {
    name: string;
    brand?: string;
    calories100?: number;
    protein100?: number;
    carbs100?: number;
    fat100?: number;
  }>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastImageRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrUi, setOcrUi] = useState<OcrUiState>({ status: "idle" });
  /** טקסט גולמי מ־OCR — לבדיקה כשהמילוי האוטומטי לא מזהה כלום */
  const [ocrDebugText, setOcrDebugText] = useState<string | null>(null);

  const ocrSectionRef = useRef<HTMLElement | null>(null);
  /** המצלמה לברקוד — דולקת רק אחרי לחיצה על «סרוק ברקוד» */
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [offLoading, setOffLoading] = useState(false);
  const [offNotice, setOffNotice] = useState<
    null | "not_found" | "network" | "success" | "from_saved"
  >(null);
  const [offData, setOffData] = useState<OpenFoodFactsProduct | null>(null);
  const [highlightOcr, setHighlightOcr] = useState(false);
  const [offSearchQuery, setOffSearchQuery] = useState("");
  const [offSearchResults, setOffSearchResults] = useState<OffSearchHit[]>([]);
  const [offSearchBusy, setOffSearchBusy] = useState(false);
  const [offSearchError, setOffSearchError] = useState<string | null>(null);
  type PortionPreset = "100" | "tbsp" | "cup" | "unit";
  const [portionPreset, setPortionPreset] = useState<PortionPreset>("100");

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    lastImageRef.current = null;
  }, []);

  useEffect(() => () => revokePreview(), [revokePreview]);

  useEffect(() => {
    if (!barcodeScannerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [barcodeScannerOpen]);

  const fetchAndApplyOffByCode = useCallback(
    async (code: string, options: { closeScanner: boolean }) => {
      if (options.closeScanner) setBarcodeScannerOpen(false);
      setOffLoading(true);
      setOffNotice(null);
      setBarcode(code);
      setOffData(null);
      try {
        const digits = normalizeBarcode(code);
        const saved =
          digits.length >= 8 ? pickLatestProductByBarcode(products, digits) : undefined;
        if (saved) {
          setName(saved.name);
          setBrand(saved.brand);
          setBarcode(saved.barcode ?? code);
          setCals100(formatMacroValue(saved.cals100));
          setProt100(formatMacroValue(saved.prot100));
          setCarb100(formatMacroValue(saved.carb100));
          setFat100(formatMacroValue(saved.fat100));
          setSugars100(saved.sugars100 !== undefined ? formatMacroValue(saved.sugars100) : "");
          setSatFat100(saved.satFat100 !== undefined ? formatMacroValue(saved.satFat100) : "");
          setTransFat100(saved.transFat100 !== undefined ? formatMacroValue(saved.transFat100) : "");
          setFiber100(saved.fiber100 !== undefined ? formatMacroValue(saved.fiber100) : "");
          setSodiumMg100(saved.sodiumMg100 !== undefined ? formatMacroValue(saved.sodiumMg100) : "");
          setSugarTsp100(
            saved.sugarTeaspoons100 !== undefined ? formatMacroValue(saved.sugarTeaspoons100) : "",
          );
          setTotalWeight(String(saved.totalWeight));
          setUnits(String(saved.units));
          playSuccessChime();
          setOffNotice("from_saved");
          window.setTimeout(() => {
            setOffNotice((n) => (n === "from_saved" ? null : n));
          }, 7000);
          return;
        }

        const result = await fetchOpenFoodFactsProduct(code);
        if (!result.ok) {
          setOffNotice("network");
          return;
        }
        if (!result.found) {
          setOffNotice("not_found");
          window.setTimeout(() => {
            ocrSectionRef.current?.scrollIntoView({
              behavior: "smooth",
              block: "start",
            });
          }, 150);
          setHighlightOcr(true);
          window.setTimeout(() => setHighlightOcr(false), 5000);
          return;
        }
        const d = result.data;
        setOffData(d);
        if (d.productName) setName(d.productName);
        if (d.brand) setBrand(d.brand);
        const qg = d.quantityG;
        const pu = d.packUnits;
        if (typeof qg === "number" && qg > 0) {
          setTotalWeight((prev) => (prev.trim() ? prev : String(Math.round(qg))));
          setUnits((prev) => {
            if (prev.trim()) return prev;
            if (typeof pu === "number" && pu > 0) return String(Math.round(pu));
            return "1";
          });
        }
        if (d.cals100 !== undefined) setCals100(formatMacroValue(d.cals100));
        if (d.prot100 !== undefined) setProt100(formatMacroValue(d.prot100));
        if (d.carb100 !== undefined) setCarb100(formatMacroValue(d.carb100));
        if (d.fat100 !== undefined) setFat100(formatMacroValue(d.fat100));
        if (d.addedSugars100 !== undefined) setSugars100(formatMacroValue(d.addedSugars100));
        else if (d.sugars100 !== undefined) setSugars100(formatMacroValue(d.sugars100));
        if (d.satFat100 !== undefined) setSatFat100(formatMacroValue(d.satFat100));
        if (d.transFat100 !== undefined) setTransFat100(formatMacroValue(d.transFat100));
        if (d.fiber100 !== undefined) setFiber100(formatMacroValue(d.fiber100));
        if (d.sodiumMg100 !== undefined) setSodiumMg100(formatMacroValue(d.sodiumMg100));
        if (d.sugarTeaspoons100 !== undefined) {
          setSugarTsp100(formatMacroValue(d.sugarTeaspoons100));
        }
        playSuccessChime();
        setOffNotice("success");
        window.setTimeout(() => {
          setOffNotice((n) => (n === "success" ? null : n));
        }, 5000);
      } finally {
        setOffLoading(false);
      }
    },
    [products],
  );

  const handleBarcode = useCallback(
    async (code: string) => {
      await fetchAndApplyOffByCode(code, { closeScanner: true });
    },
    [fetchAndApplyOffByCode],
  );

  const runOffSearch = useCallback(async () => {
    setOffSearchError(null);
    const q = offSearchQuery.trim();
    if (q.length < 2) {
      setOffSearchError("נא להזין לפחות שני תווים.");
      return;
    }
    setOffSearchBusy(true);
    setOffSearchResults([]);
    try {
      const res = await searchOpenFoodFactsProducts(q);
      if (!res.ok) {
        setOffSearchError(
          res.reason === "timeout"
            ? "החיפוש ארך זמן רב — נסי שוב."
            : res.reason === "blocked"
              ? "חיפוש השם אינו זמין כרגע — נסי שוב מאוחר יותר או סרקי ברקוד."
              : res.reason === "parse"
                ? "תגובה לא צפויה מהמאגר — נסי שוב."
                : "לא ניתן להתחבר למאגר — בדקי רשת ונסי שוב.",
        );
        return;
      }
      setOffSearchResults(res.results);
      if (res.results.length === 0) {
        setOffSearchError("לא נמצאו מוצרים — נסי מילה אחרת.");
      }
    } finally {
      setOffSearchBusy(false);
    }
  }, [offSearchQuery]);

  useEffect(() => {
    const n = name.trim();
    if (!n || n.length < 3) {
      setVerifiedCandidate(null);
      return;
    }
    const match = findBestMatch({ name: n, brand: brand.trim() || undefined });
    if (!match) {
      setVerifiedCandidate(null);
      return;
    }
    setVerifiedCandidate({
      name: match.name,
      brand: match.brand,
      calories100: match.calories100,
      protein100: match.protein100,
      carbs100: match.carbs100,
      fat100: match.fat100,
    });
  }, [name, brand, findBestMatch]);

  useEffect(() => {
    if (!verifiedCandidate) return;
    if (verifiedCandidate.calories100 !== undefined) {
      setCals100((prev) => (prev.trim() ? prev : formatMacroValue(verifiedCandidate.calories100!)));
    }
    if (verifiedCandidate.protein100 !== undefined) {
      setProt100((prev) => (prev.trim() ? prev : formatMacroValue(verifiedCandidate.protein100!)));
    }
    if (verifiedCandidate.carbs100 !== undefined) {
      setCarb100((prev) => (prev.trim() ? prev : formatMacroValue(verifiedCandidate.carbs100!)));
    }
    if (verifiedCandidate.fat100 !== undefined) {
      setFat100((prev) => (prev.trim() ? prev : formatMacroValue(verifiedCandidate.fat100!)));
    }

    const qg = offData?.quantityG;
    const pu = offData?.packUnits;
    if (typeof qg === "number" && qg > 0) {
      setTotalWeight((prev) => (prev.trim() ? prev : String(Math.round(qg))));
      setUnits((prev) => {
        if (prev.trim()) return prev;
        if (typeof pu === "number" && pu > 0) return String(Math.round(pu));
        return "1";
      });
    }
  }, [verifiedCandidate, offData?.quantityG, offData?.packUnits]);

  const applyVerified = useCallback(() => {
    if (!verifiedCandidate) return;
    if (verifiedCandidate.calories100 !== undefined) {
      setCals100(formatMacroValue(verifiedCandidate.calories100));
    }
    if (verifiedCandidate.protein100 !== undefined) {
      setProt100(formatMacroValue(verifiedCandidate.protein100));
    }
    if (verifiedCandidate.carbs100 !== undefined) {
      setCarb100(formatMacroValue(verifiedCandidate.carbs100));
    }
    if (verifiedCandidate.fat100 !== undefined) {
      setFat100(formatMacroValue(verifiedCandidate.fat100));
    }
  }, [verifiedCandidate]);

  const runOcrOnFile = useCallback(
    async (file: File) => {
      setOcrUi({ status: "loading" });
      setOcrDebugText(null);
      try {
        const text = await runLabelOcr(file);
        const trimmed = text.trim();
        setOcrDebugText(trimmed.length > 0 ? trimmed : null);
        const parsed = parseNutritionFromOcrText(text);
        const n = countParsedFields(parsed);
        applyMacrosToFields(parsed, {
          setCals100,
          setProt100,
          setCarb100,
          setSugars100,
          setFat100,
          setSatFat100,
          setTransFat100,
          setFiber100,
          setSodiumMg100,
          setSugarTsp100,
        });
        const pkg = parsePackageFromOcrText(text);
        if (pkg.totalWeightG !== undefined) {
          setTotalWeight((prev) => (prev.trim() ? prev : String(pkg.totalWeightG)));
        }
        if (pkg.units !== undefined) {
          setUnits((prev) => (prev.trim() ? prev : String(pkg.units)));
        }
        if (n >= 4) setOcrUi({ status: "success", filled: n });
        else if (n > 0) setOcrUi({ status: "partial", filled: n });
        else setOcrUi({ status: "none" });
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "שגיאה לא ידועה";
        setOcrUi({ status: "error", message: msg });
      }
    },
    [],
  );

  const handleCameraInputChange = useCallback(
    (e: ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      e.target.value = "";
      if (!file || !file.type.startsWith("image/")) return;

      revokePreview();
      const url = URL.createObjectURL(file);
      setPreviewUrl(url);
      lastImageRef.current = file;
      void runOcrOnFile(file);
    },
    [revokePreview, runOcrOnFile],
  );

  const handleOpenCamera = useCallback(() => {
    cameraInputRef.current?.click();
  }, []);

  const handleRemoveImage = useCallback(() => {
    revokePreview();
    setOcrUi({ status: "idle" });
    setOcrDebugText(null);
  }, [revokePreview]);

  const handleRescan = useCallback(() => {
    const f = lastImageRef.current;
    if (f) void runOcrOnFile(f);
  }, [runOcrOnFile]);

  const derived = useMemo(() => {
    const tw = parseNum(totalWeight);
    const u = parseNum(units);
    const c100 = parseNum(cals100);
    const p100 = parseNum(prot100);
    const cb100 = parseNum(carb100);
    const f100 = parseNum(fat100);

    if (!(u > 0) || !Number.isFinite(tw) || !(tw > 0)) {
      return {
        unitWeight: NaN,
        calsUnit: NaN,
        protUnit: NaN,
        carbUnit: NaN,
        fatUnit: NaN,
        hasPackage: false,
      };
    }

    const unitWeight = tw / u;
    const factor = unitWeight / 100;

    return {
      unitWeight,
      calsUnit: Number.isFinite(c100) ? c100 * factor : NaN,
      protUnit: Number.isFinite(p100) ? p100 * factor : NaN,
      carbUnit: Number.isFinite(cb100) ? cb100 * factor : NaN,
      fatUnit: Number.isFinite(f100) ? f100 * factor : NaN,
      hasPackage: true,
    };
  }, [totalWeight, units, cals100, prot100, carb100, fat100]);

  const PORTION_TBSP_G = 15;
  const PORTION_CUP_G = 240;

  const portionGrams = useMemo(() => {
    switch (portionPreset) {
      case "100":
        return 100;
      case "tbsp":
        return PORTION_TBSP_G;
      case "cup":
        return PORTION_CUP_G;
      case "unit":
        if (!derived.hasPackage || !Number.isFinite(derived.unitWeight)) return NaN;
        return derived.unitWeight;
      default:
        return 100;
    }
  }, [portionPreset, derived.hasPackage, derived.unitWeight]);

  const portionPreview = useMemo(() => {
    const g = portionGrams;
    if (!Number.isFinite(g) || g <= 0) return null;
    const f = g / 100;
    const c100 = parseNum(cals100);
    const p100 = parseNum(prot100);
    const cb100 = parseNum(carb100);
    const f100 = parseNum(fat100);
    return {
      grams: g,
      cals: Number.isFinite(c100) ? c100 * f : NaN,
      prot: Number.isFinite(p100) ? p100 * f : NaN,
      carb: Number.isFinite(cb100) ? cb100 * f : NaN,
      fat: Number.isFinite(f100) ? f100 * f : NaN,
    };
  }, [portionGrams, cals100, prot100, carb100, fat100]);

  const portionWalkSteps = useMemo(() => {
    if (!portionPreview || !Number.isFinite(portionPreview.cals) || portionPreview.cals <= 0) {
      return null;
    }
    if (bodyWeightKg === null) return null;
    return walkingStepsToBurnKcal(portionPreview.cals, bodyWeightKg);
  }, [portionPreview, bodyWeightKg]);

  const unitWalkSteps = useMemo(() => {
    if (
      !derived.hasPackage ||
      !Number.isFinite(derived.calsUnit) ||
      derived.calsUnit <= 0
    ) {
      return null;
    }
    if (bodyWeightKg === null) return null;
    return walkingStepsToBurnKcal(derived.calsUnit, bodyWeightKg);
  }, [derived.hasPackage, derived.calsUnit, bodyWeightKg]);

  async function handleSave() {
    setError(null);
    const n = name.trim();
    if (!n) {
      setError("נא להזין שם מוצר.");
      return;
    }
    const tw = parseNum(totalWeight);
    const u = parseNum(units);
    if (!(tw > 0) || !(u > 0)) {
      setError("משקל כולל ומספר יחידות חייבים להיות מספרים חיוביים.");
      return;
    }
    const c100 = parseNum(cals100);
    if (!Number.isFinite(c100)) {
      setError("נא להזין קלוריות ל-100 גרם.");
      return;
    }

    const p100 = parseNum(prot100);
    const cb100 = parseNum(carb100);
    const sug100 = parseNum(sugars100);
    const f100 = parseNum(fat100);
    const sat100 = parseNum(satFat100);
    const trans100 = parseNum(transFat100);
    const fib100 = parseNum(fiber100);
    const sod100 = parseNum(sodiumMg100);
    const tsp100 = parseNum(sugarTsp100);

    const unitWeight = tw / u;
    const factor = unitWeight / 100;

    try {
      await addProduct({
        barcode: barcode.trim() || undefined,
        name: n,
        brand: brand.trim(),
        cals100: c100,
        prot100: Number.isFinite(p100) ? p100 : 0,
        carb100: Number.isFinite(cb100) ? cb100 : 0,
        fat100: Number.isFinite(f100) ? f100 : 0,
        sugars100: Number.isFinite(sug100) ? sug100 : undefined,
        satFat100: Number.isFinite(sat100) ? sat100 : undefined,
        transFat100: Number.isFinite(trans100) ? trans100 : undefined,
        fiber100: Number.isFinite(fib100) ? fib100 : undefined,
        sodiumMg100: Number.isFinite(sod100) ? sod100 : undefined,
        sugarTeaspoons100: Number.isFinite(tsp100) ? tsp100 : undefined,
        totalWeight: tw,
        units: u,
        unitWeight,
        calsUnit: c100 * factor,
        protUnit: (Number.isFinite(p100) ? p100 : 0) * factor,
        carbUnit: (Number.isFinite(cb100) ? cb100 : 0) * factor,
        fatUnit: (Number.isFinite(f100) ? f100 : 0) * factor,
      });
    } catch (err) {
      console.error("Home save — full error:", err);
      const msg =
        err instanceof Error && err.message
          ? err.message
          : "שמירה נכשלה. בדקי חיבור/הרשאות ונסי שוב.";
      setError(msg);
      return;
    }

    setBarcode("");
    setOffData(null);
    setName("");
    setBrand("");
    setCals100("");
    setProt100("");
    setCarb100("");
    setSugars100("");
    setFat100("");
    setSatFat100("");
    setTransFat100("");
    setFiber100("");
    setSodiumMg100("");
    setSugarTsp100("");
    setTotalWeight("");
    setUnits("");
    handleRemoveImage();
  }

  return (
    <>
    <div className="space-y-8 pb-4">
      <div className="space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
            איסוף נתונים
          </p>
          <p className="text-sm text-ink-muted">
            סרקי ברקוד או חפשי לפי שם, השוו לתווית, והשלימי את הערכים לפני שמירה.
          </p>
        </header>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold text-ink-dim">סריקת ברקוד</h2>
          <span className="text-[10px] text-ink-dim">מאגר ציבורי עולמי</span>
        </div>
        <p className="text-xs text-ink-muted">
          «סרוק ברקוד» פותח מסך מלא עם המצלמה. אם כבר שמרת את המוצר — ייטענו הנתונים
          השמורים; אחרת יוצעו נתונים מהמאגר הציבורי לבדיקה מול התווית.
        </p>

        {offNotice === "not_found" && (
          <p className="rounded-xl border border-white/20 bg-white/[0.06] px-4 py-3 text-sm leading-relaxed text-white">
            מוצר לא נמצא במאגר, אנא סרקי את התווית ידנית
          </p>
        )}
        {offNotice === "network" && (
          <p className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-ink-muted">
            לא ניתן להתחבר למאגר כרגע — ניתן למלא את השדות ידנית.
          </p>
        )}
        {offNotice === "from_saved" && (
          <p className="rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-sm text-emerald-50">
            נטען מהמוצר השמור אצלך — הנתונים לפי מה שהזנת מהתווית. אפשר לערוך למטה
            לפני שמירה חוזרת.
          </p>
        )}
        {offNotice === "success" && (
          <p className="rounded-xl border border-white/25 bg-white/[0.08] px-4 py-3 text-sm text-white">
            נטען מקובץ ציבורי — ודאי מול התווית: משקל אריזה, מספר יחידות וטבלת 100 גרם.
          </p>
        )}

        {offLoading ? (
          <div
            className="flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-2xl border border-white/10 bg-black/50 px-4 py-10 animate-fade-in"
            key="off-loading"
          >
            <Spinner />
            <p className="text-sm text-ink-muted">טוען נתונים מהמאגר…</p>
          </div>
        ) : null}

        {!offLoading && !barcodeScannerOpen ? (
          <button
            key="barcode-idle-btn"
            type="button"
            onClick={() => {
              setBarcodeScannerOpen(true);
              setOffNotice(null);
            }}
            className="flex min-h-[52px] w-full animate-fade-in items-center justify-center gap-3 rounded-2xl border border-white/25 bg-white/[0.09] text-lg font-semibold text-white transition hover:bg-white/[0.12] active:scale-[0.99]"
          >
            <BarcodeIcon className="h-7 w-7 shrink-0 opacity-90" />
            סרוק ברקוד
          </button>
        ) : null}

      </section>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <h2 className="text-xs font-semibold text-ink-dim">חיפוש במאגר (שם / מותג)</h2>
        <p className="text-xs text-ink-muted">
          אותה לוגיקה כמו אחרי סריקת ברקוד: קודם מה שנשמר אצלך, אחרת מהמאגר.
        </p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input
            type="search"
            value={offSearchQuery}
            onChange={(e) => setOffSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runOffSearch();
            }}
            placeholder="למשל: תלמה מיונז"
            className="min-h-[48px] flex-1 rounded-xl border border-white/15 bg-black/40 px-4 text-sm text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none"
            dir="rtl"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => void runOffSearch()}
            disabled={offSearchBusy || offLoading}
            className="min-h-[48px] shrink-0 rounded-xl border border-white/25 bg-white/[0.09] px-6 text-sm font-semibold text-white transition enabled:active:scale-[0.99] enabled:hover:bg-white/[0.12] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {offSearchBusy ? "מחפש…" : "חיפוש"}
          </button>
        </div>
        {offSearchError ? (
          <p className="text-sm text-amber-200/90">{offSearchError}</p>
        ) : null}
        {offSearchResults.length > 0 ? (
          <ul className="max-h-64 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/30 p-2">
            {offSearchResults.map((h) => (
              <li key={h.code}>
                <button
                  type="button"
                  disabled={offLoading}
                  onClick={() => void fetchAndApplyOffByCode(h.code, { closeScanner: false })}
                  className="w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-right text-sm transition enabled:hover:border-white/20 enabled:hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <span className="font-medium text-white">{h.productName}</span>
                  {h.brand ? (
                    <span className="text-ink-muted"> · {h.brand}</span>
                  ) : null}
                  <span className="mt-0.5 block font-mono text-[11px] text-ink-dim" dir="ltr">
                    {h.code}
                  </span>
                  {h.quantityText ? (
                    <span className="mt-0.5 block text-xs text-ink-dim">{h.quantityText}</span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>

      <section
        ref={ocrSectionRef}
        id="label-scan-section"
        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      >
        <h2 className="text-xs font-semibold text-ink-dim">סריקת תווית</h2>
        <p className="text-xs text-ink-muted">
          צלמו רק את טבלת התזונה ל-100 גרם — תאורה יציבה וקרוב לתווית. אם לא זוהה כלום,
          אפשר לראות למטה את הטקסט שחולץ מהתמונה.
        </p>
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="sr-only"
          onChange={handleCameraInputChange}
        />
        <button
          type="button"
          onClick={() => {
            setHighlightOcr(false);
            handleOpenCamera();
          }}
          disabled={ocrUi.status === "loading"}
          className={`flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl border border-white/20 bg-white/[0.08] text-lg font-semibold text-white transition enabled:active:scale-[0.99] disabled:opacity-50 ${
            highlightOcr
              ? "ring-2 ring-white/80 ring-offset-2 ring-offset-black"
              : ""
          }`}
        >
          <CameraIcon className="h-7 w-7 shrink-0" />
          סרוק תווית
        </button>

        {previewUrl ? (
          <div className="flex flex-wrap items-start gap-4 pt-2">
            <div className="relative shrink-0 overflow-hidden rounded-xl border border-white/15">
              <img
                src={previewUrl}
                alt="תצוגה מקדימה של תווית"
                className="h-28 w-28 object-cover"
              />
              {ocrUi.status === "loading" ? (
                <div className="absolute inset-0 flex items-center justify-center bg-black/55">
                  <Spinner />
                </div>
              ) : null}
            </div>
            <div className="min-w-0 flex-1 space-y-2 text-sm">
              {ocrUi.status === "loading" && (
                <p className="text-ink-muted">מעבד תמונה ומחלץ טקסט…</p>
              )}
              {ocrUi.status === "success" && (
                <p className="text-white">
                  זוהו ארבעת הערכים — מומלץ לוודא מול התווית לפני השמירה.
                </p>
              )}
              {ocrUi.status === "partial" && (
                <p className="text-ink-muted">
                  זוהו {ocrUi.filled} מתוך 4 שדות — ניתן לערוך ידנית את השדות
                  שלמטה לפני השמירה.
                </p>
              )}
              {ocrUi.status === "none" && (
                <p className="text-ink-muted">
                  לא זוהו ערכים — נסו צילום חד, תאורה חזקה, או מלאו ידנית את השדות
                  שלמטה.
                </p>
              )}
              {ocrUi.status === "error" && (
                <p className="text-white">
                  שגיאת סריקה: {ocrUi.message}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={handleRescan}
                  disabled={ocrUi.status === "loading"}
                  className="rounded-xl border border-white/20 px-3 py-2 text-xs font-medium text-white disabled:opacity-40"
                >
                  סרוק שוב
                </button>
                <button
                  type="button"
                  onClick={handleRemoveImage}
                  className="rounded-xl border border-white/10 px-3 py-2 text-xs text-ink-muted"
                >
                  הסר תמונה
                </button>
              </div>
              {ocrDebugText && ocrUi.status !== "loading" ? (
                <details className="mt-2 rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-xs text-ink-muted">
                  <summary className="cursor-pointer select-none text-ink-muted">
                    טקסט שזוהה מהתמונה
                  </summary>
                  <pre
                    className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap rounded-lg bg-black/40 p-2 text-[11px] text-white/75"
                    dir="ltr"
                  >
                    {ocrDebugText.length > 12000
                      ? `${ocrDebugText.slice(0, 12000)}\n…`
                      : ocrDebugText}
                  </pre>
                </details>
              ) : null}
            </div>
          </div>
        ) : null}
      </section>
      </div>

      <section className="space-y-8 border-t border-white/10 pt-8" aria-label="השלמת פרטים ושמירה">
        <h2 className="text-xs font-semibold text-ink-dim">
          השלמת פרטים ושמירה
        </h2>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">
          מוצר
        </h2>
        <Field
          id="barcode"
          label="ברקוד (מומלץ לזיהוי ולייצוא)"
          value={barcode}
          onChange={setBarcode}
          placeholder="לדוגמה: 7290000000000"
          inputMode="numeric"
        />
        <Field
          id="product-name"
          label="שם המוצר"
          value={name}
          onChange={setName}
          placeholder="לדוגמה: יוגורט יווני"
        />
        <Field
          id="brand"
          label="מותג"
          value={brand}
          onChange={setBrand}
          placeholder="לא חובה"
        />
      </section>

      {verifiedCandidate ? (
        <section className="rounded-2xl border border-emerald-400/25 bg-emerald-500/10 p-4">
          <p className="text-sm font-semibold text-white">נמצא מוצר מאומת דומה</p>
          <p className="mt-1 text-xs text-ink-muted">
            {verifiedCandidate.name}
            {verifiedCandidate.brand ? ` · ${verifiedCandidate.brand}` : ""}
            {" — "}מילוי ערכי 100g מאומתים?
          </p>
          <button
            type="button"
            onClick={applyVerified}
            className="mt-3 min-h-[44px] w-full rounded-2xl bg-white text-sm font-semibold text-black transition active:scale-[0.99]"
          >
            החל ערכים מאומתים
          </button>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">
          ל-100 גרם
        </h2>
        {(ocrUi.status === "partial" || ocrUi.status === "none") && (
          <p className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100/95">
            הזיהוי אינו מלא — נא לבדוק ולערוך ידנית את השדות לפני השמירה.
          </p>
        )}
        {ocrUi.status === "success" && (
          <p className="rounded-xl border border-white/15 bg-white/[0.04] px-4 py-3 text-sm text-ink-muted">
            הזיהוי אינו מושלם תמיד — מומלץ לוודא את הערכים מול התווית לפני השמירה.
          </p>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="cals100"
            label="קלוריות ל-100 גרם"
            value={cals100}
            onChange={setCals100}
            inputMode="decimal"
          />
          <Field
            id="prot100"
            label="חלבון (גרם)"
            value={prot100}
            onChange={setProt100}
            inputMode="decimal"
          />
          <Field
            id="carb100"
            label="פחמימות (גרם)"
            value={carb100}
            onChange={setCarb100}
            inputMode="decimal"
          />
          <Field
            id="sugars100"
            label="סוכרים מוספים (גרם) — אם אין, זה יתמלא מסוכרים כלליים"
            value={sugars100}
            onChange={setSugars100}
            inputMode="decimal"
          />
          <Field
            id="fat100"
            label="שומן (גרם)"
            value={fat100}
            onChange={setFat100}
            inputMode="decimal"
          />
          <Field
            id="satfat100"
            label="שומן רווי (גרם)"
            value={satFat100}
            onChange={setSatFat100}
            inputMode="decimal"
          />
          <Field
            id="transfat100"
            label="שומן טראנס (גרם)"
            value={transFat100}
            onChange={setTransFat100}
            inputMode="decimal"
          />
          <Field
            id="fiber100"
            label="סיבים תזונתיים (גרם)"
            value={fiber100}
            onChange={setFiber100}
            inputMode="decimal"
          />
          <Field
            id="sodium100"
            label="נתרן (מ״ג)"
            value={sodiumMg100}
            onChange={setSodiumMg100}
            inputMode="decimal"
          />
          <Field
            id="sugar-tsp-100"
            label="כפיות סוכר (ל־100 גרם)"
            value={sugarTsp100}
            onChange={setSugarTsp100}
            inputMode="decimal"
          />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="text-xs font-semibold text-ink-dim">
          אריזה
        </h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field
            id="total-weight"
            label="משקל כולל של האריזה (גרם)"
            value={totalWeight}
            onChange={setTotalWeight}
            inputMode="decimal"
          />
          <Field
            id="units"
            label="יחידות באריזה (כמה פריטים בפנים)"
            value={units}
            onChange={setUnits}
            inputMode="numeric"
          />
        </div>
        <p className="text-xs text-ink-dim">
          &quot;משקל כולל&quot; הוא כל האריזה; &quot;יחידות באריזה&quot; מתייחס לרב־חבילה (למשל 6) ולא למשקל של יחידה בודדת.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-5">
        <h2 className="mb-4 text-xs font-semibold text-ink-dim">
          ליחידה בודדת
        </h2>
        <div className="mb-4 border-b border-white/10 pb-4">
          <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-dim">
            מנה לתצוגה
          </h3>
          <p className="mb-3 text-xs text-ink-muted">
            בחרי 100 גרם, כף, כוס או יחידה מהאריזה — התצוגה והצעדים מתעדכנים; השמירה נשארת
            לפי השדות למעלה.
          </p>
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "100" as const, label: "100 גרם" },
                { id: "tbsp" as const, label: `כף (~${PORTION_TBSP_G}g)` },
                { id: "cup" as const, label: `כוס (~${PORTION_CUP_G}g)` },
                { id: "unit" as const, label: "יחידה מהאריזה" },
              ] as const
            ).map(({ id, label }) => {
              const disabled = id === "unit" && !derived.hasPackage;
              const active = portionPreset === id;
              return (
                <button
                  key={id}
                  type="button"
                  disabled={disabled}
                  onClick={() => setPortionPreset(id)}
                  className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                    active
                      ? "border-white/40 bg-white/15 text-white"
                      : "border-white/15 bg-white/[0.04] text-ink-muted enabled:hover:border-white/25 enabled:hover:text-white"
                  } disabled:cursor-not-allowed disabled:opacity-35`}
                >
                  {label}
                </button>
              );
            })}
          </div>
          {portionPreview ? (
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <div className="col-span-2">
                <dt className="text-ink-muted">משקל המנה</dt>
                <dd className="font-medium tabular-nums text-white">
                  {fmt1(portionPreview.grams)} גרם
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">קלוריות</dt>
                <dd className="font-medium tabular-nums text-white">
                  {fmt1(portionPreview.cals)} קק&quot;ל
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">חלבון</dt>
                <dd className="font-medium tabular-nums text-white">
                  {fmt1(portionPreview.prot)} גרם
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">פחמימות</dt>
                <dd className="font-medium tabular-nums text-white">
                  {fmt1(portionPreview.carb)} גרם
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">שומן</dt>
                <dd className="font-medium tabular-nums text-white">
                  {fmt1(portionPreview.fat)} גרם
                </dd>
              </div>
              {Number.isFinite(portionPreview.cals) && portionPreview.cals > 0 ? (
                <div className="col-span-2 border-t border-white/10 pt-3">
                  <dt className="text-ink-muted">הליכה — צעדים משוערים להוצאת המנה</dt>
                  <dd className="mt-0.5 text-sm font-medium tabular-nums text-white">
                    {bodyWeightKg !== null && portionWalkSteps !== null ? (
                      <>
                        כ־{portionWalkSteps.toLocaleString("he-IL")} צעדים
                        <span className="mt-1 block text-[11px] font-normal text-ink-dim">
                          MET {WALKING_MET}, משקל {bodyWeightKg} ק״ג (מ«הגדרות»)
                        </span>
                      </>
                    ) : (
                      <span className="font-normal text-ink-muted">
                        הזיני משקל גוף ב«הגדרות» לחישוב צעדים.
                      </span>
                    )}
                  </dd>
                </div>
              ) : null}
            </dl>
          ) : portionPreset === "unit" && !derived.hasPackage ? (
            <p className="mt-3 text-xs text-ink-dim">
              הזיני משקל כולל ויחידות כדי לחשב &quot;יחידה מהאריזה&quot;.
            </p>
          ) : null}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          <div>
            <dt className="text-ink-muted">משקל יחידה</dt>
            <dd className="font-medium tabular-nums text-white">
              {fmt1(derived.unitWeight)} גרם
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">קלוריות</dt>
            <dd className="font-medium tabular-nums text-white">
              {fmt1(derived.calsUnit)} קק&quot;ל
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">חלבון</dt>
            <dd className="font-medium tabular-nums text-white">
              {fmt1(derived.protUnit)} גרם
            </dd>
          </div>
          <div>
            <dt className="text-ink-muted">פחמימות</dt>
            <dd className="font-medium tabular-nums text-white">
              {fmt1(derived.carbUnit)} גרם
            </dd>
          </div>
          <div className="col-span-2">
            <dt className="text-ink-muted">שומן</dt>
            <dd className="font-medium tabular-nums text-white">
              {fmt1(derived.fatUnit)} גרם
            </dd>
          </div>
          {derived.hasPackage && Number.isFinite(derived.calsUnit) && derived.calsUnit > 0 ? (
            <div className="col-span-2 border-t border-white/10 pt-3">
              <dt className="text-ink-muted">הליכה — צעדים ליחידה אחת</dt>
              <dd className="mt-0.5 text-sm font-medium tabular-nums text-white">
                {bodyWeightKg !== null && unitWalkSteps !== null ? (
                  <>
                    כ־{unitWalkSteps.toLocaleString("he-IL")} צעדים
                    <span className="mt-1 block text-[11px] font-normal text-ink-dim">
                      MET {WALKING_MET}, משקל {bodyWeightKg} ק״ג
                    </span>
                  </>
                ) : (
                  <span className="font-normal text-ink-muted">
                    הזיני משקל גוף ב«הגדרות» לחישוב צעדים.
                  </span>
                )}
              </dd>
            </div>
          ) : null}
        </dl>
        {!derived.hasPackage && (
          <p className="mt-3 text-xs text-ink-dim">
            הזן משקל כולל ומספר יחידות כדי לחשב ערכים ליחידה.
          </p>
        )}
      </section>

      {error && (
        <p className="rounded-xl border border-white/20 bg-white/5 px-4 py-3 text-sm text-white">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={handleSave}
        className="min-h-[56px] w-full rounded-2xl bg-white text-lg font-semibold text-black shadow-lg shadow-white/10 transition active:scale-[0.99] active:bg-neutral-200"
      >
        שמור מוצר
      </button>
      </section>
    </div>

      {typeof document !== "undefined" && barcodeScannerOpen
        ? createPortal(
            <div
              className="fixed inset-0 z-[220] flex flex-col bg-black text-white"
              role="dialog"
              aria-modal="true"
              aria-labelledby="barcode-fullscreen-title"
            >
              <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <p
                  id="barcode-fullscreen-title"
                  className="min-w-0 text-lg font-semibold tracking-tight"
                >
                  סריקת ברקוד
                </p>
                <button
                  type="button"
                  onClick={() => setBarcodeScannerOpen(false)}
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
                    onScan={handleBarcode}
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
