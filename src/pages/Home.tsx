import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
} from "react";
import { Spinner } from "../components/Spinner";
import { useProducts } from "../context/ProductsContext";
import {
  countParsedFields,
  parseNutritionFromOcrText,
  runLabelOcr,
  type ParsedMacros,
} from "../utils/labelOcr";
import { BarcodeScanner } from "../components/BarcodeScanner";
import { fetchOpenFoodFactsProduct } from "../utils/openFoodFacts";
import { playSuccessChime } from "../utils/successChime";
import { fmt1, parseNum } from "../utils/number";

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
    setFat100: (v: string) => void;
  },
) {
  if (p.cals100 !== undefined) setters.setCals100(formatMacroValue(p.cals100));
  if (p.prot100 !== undefined) setters.setProt100(formatMacroValue(p.prot100));
  if (p.carb100 !== undefined) setters.setCarb100(formatMacroValue(p.carb100));
  if (p.fat100 !== undefined) setters.setFat100(formatMacroValue(p.fat100));
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

export function Home() {
  const { addProduct } = useProducts();
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [cals100, setCals100] = useState("");
  const [prot100, setProt100] = useState("");
  const [carb100, setCarb100] = useState("");
  const [fat100, setFat100] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [units, setUnits] = useState("");
  const [error, setError] = useState<string | null>(null);

  const cameraInputRef = useRef<HTMLInputElement>(null);
  const lastImageRef = useRef<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [ocrUi, setOcrUi] = useState<OcrUiState>({ status: "idle" });

  const ocrSectionRef = useRef<HTMLElement | null>(null);
  /** המצלמה לברקוד — דולקת רק אחרי לחיצה על «סרוק ברקוד» */
  const [barcodeScannerOpen, setBarcodeScannerOpen] = useState(false);
  const [offLoading, setOffLoading] = useState(false);
  const [offNotice, setOffNotice] = useState<
    null | "not_found" | "network" | "success"
  >(null);
  const [highlightOcr, setHighlightOcr] = useState(false);

  const revokePreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    lastImageRef.current = null;
  }, []);

  useEffect(() => () => revokePreview(), [revokePreview]);

  const handleBarcode = useCallback(async (code: string) => {
    setBarcodeScannerOpen(false);
    setOffLoading(true);
    setOffNotice(null);
    try {
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
      if (d.productName) setName(d.productName);
      if (d.brand) setBrand(d.brand);
      if (d.cals100 !== undefined) setCals100(formatMacroValue(d.cals100));
      if (d.prot100 !== undefined) setProt100(formatMacroValue(d.prot100));
      if (d.carb100 !== undefined) setCarb100(formatMacroValue(d.carb100));
      if (d.fat100 !== undefined) setFat100(formatMacroValue(d.fat100));
      playSuccessChime();
      setOffNotice("success");
      window.setTimeout(() => {
        setOffNotice((n) => (n === "success" ? null : n));
      }, 5000);
    } finally {
      setOffLoading(false);
    }
  }, []);

  const runOcrOnFile = useCallback(
    async (file: File) => {
      setOcrUi({ status: "loading" });
      try {
        const text = await runLabelOcr(file);
        const parsed = parseNutritionFromOcrText(text);
        const n = countParsedFields(parsed);
        applyMacrosToFields(parsed, {
          setCals100,
          setProt100,
          setCarb100,
          setFat100,
        });
        if (n === 4) setOcrUi({ status: "success", filled: n });
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

  function handleSave() {
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
    const f100 = parseNum(fat100);

    const unitWeight = tw / u;
    const factor = unitWeight / 100;

    addProduct({
      name: n,
      brand: brand.trim(),
      cals100: c100,
      prot100: Number.isFinite(p100) ? p100 : 0,
      carb100: Number.isFinite(cb100) ? cb100 : 0,
      fat100: Number.isFinite(f100) ? f100 : 0,
      totalWeight: tw,
      units: u,
      unitWeight,
      calsUnit: c100 * factor,
      protUnit: (Number.isFinite(p100) ? p100 : 0) * factor,
      carbUnit: (Number.isFinite(cb100) ? cb100 : 0) * factor,
      fatUnit: (Number.isFinite(f100) ? f100 : 0) * factor,
    });

    setName("");
    setBrand("");
    setCals100("");
    setProt100("");
    setCarb100("");
    setFat100("");
    setTotalWeight("");
    setUnits("");
    handleRemoveImage();
  }

  return (
    <div className="space-y-8 pb-4">
      <div className="space-y-8">
        <header className="space-y-3 border-b border-white/10 pb-6">
          <p className="font-display text-3xl font-semibold tracking-tight text-white md:text-4xl">
            איסוף נתונים
          </p>
          <p className="text-sm text-ink-muted">
            סריקת ברקוד או תווית — ואז השלימי את הפרטים למטה לפני השמירה.
          </p>
        </header>

      <section className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-xs font-semibold text-ink-dim">סריקת ברקוד</h2>
          <span className="text-[10px] text-ink-dim">מאגר ציבורי עולמי</span>
        </div>
        <p className="text-xs text-ink-muted">
          לחצו על «סרוק ברקוד» לפתיחת המצלמה. הנתונים נמשכים מהמאגר הציבורי אחרי
          זיהוי.
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
        {offNotice === "success" && (
          <p className="rounded-xl border border-white/25 bg-white/[0.08] px-4 py-3 text-sm text-white">
            המוצר נטען מהמאגר — מומלץ לוודא מול האריזה.
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

        {!offLoading && barcodeScannerOpen ? (
          <div key="barcode-live" className="animate-fade-in space-y-3">
            <BarcodeScanner isActive onScan={handleBarcode} />
            <button
              type="button"
              onClick={() => setBarcodeScannerOpen(false)}
              className="min-h-[48px] w-full rounded-2xl border border-white/15 bg-transparent text-base font-medium text-ink-muted transition hover:border-white/25 hover:text-white active:scale-[0.99]"
            >
              ביטול
            </button>
          </div>
        ) : null}
      </section>

      <section
        ref={ocrSectionRef}
        id="label-scan-section"
        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-4"
      >
        <h2 className="text-xs font-semibold text-ink-dim">סריקת תווית (OCR)</h2>
        <p className="text-xs text-ink-muted">
          צלמו את טבלת התזונה ל-100 גרם. המערכת מחפשת מילות מפתח כמו{" "}
          <span className="text-white/90">אנרגיה</span>,{" "}
          <span className="text-white/90">חלבון</span>,{" "}
          <span className="text-white/90">פחמימות</span>,{" "}
          <span className="text-white/90">שומן</span> וממלאת את השדות לפי המספרים
          לידן.
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
            id="fat100"
            label="שומן (גרם)"
            value={fat100}
            onChange={setFat100}
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
            label="משקל כולל (גרם)"
            value={totalWeight}
            onChange={setTotalWeight}
            inputMode="decimal"
          />
          <Field
            id="units"
            label="מספר יחידות"
            value={units}
            onChange={setUnits}
            inputMode="numeric"
          />
        </div>
      </section>

      <section className="rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.07] to-transparent p-5">
        <h2 className="mb-4 text-xs font-semibold text-ink-dim">
          ליחידה בודדת
        </h2>
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
  );
}
