import { useEffect, useState, type FormEvent } from "react";
import type { Product } from "../types/product";
import { buildProductPayload } from "../utils/buildProduct";
import { parseNum } from "../utils/number";

type Props = {
  product: Product | null;
  onClose: () => void;
  onSave: (product: Product) => Promise<void>;
};

function Field({
  label,
  id,
  value,
  onChange,
  inputMode,
}: {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  inputMode?: "decimal" | "numeric";
}) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-xs font-medium text-ink-muted">
        {label}
      </label>
      <input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode={inputMode}
        autoComplete="off"
        className="min-h-[48px] w-full rounded-xl border border-white/15 bg-white/[0.06] px-3 text-base text-white placeholder:text-ink-dim focus:border-white/35 focus:outline-none focus:ring-2 focus:ring-white/15"
      />
    </div>
  );
}

export function EditProductModal({ product, onClose, onSave }: Props) {
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [cals100, setCals100] = useState("");
  const [prot100, setProt100] = useState("");
  const [carb100, setCarb100] = useState("");
  const [fat100, setFat100] = useState("");
  const [sugars100, setSugars100] = useState("");
  const [satFat100, setSatFat100] = useState("");
  const [transFat100, setTransFat100] = useState("");
  const [fiber100, setFiber100] = useState("");
  const [sodiumMg100, setSodiumMg100] = useState("");
  const [sugarTsp100, setSugarTsp100] = useState("");
  const [totalWeight, setTotalWeight] = useState("");
  const [units, setUnits] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!product) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [product, onClose]);

  useEffect(() => {
    if (!product) return;
    setName(product.name);
    setBrand(product.brand);
    setCals100(String(product.cals100));
    setProt100(String(product.prot100));
    setCarb100(String(product.carb100));
    setFat100(String(product.fat100));
    setSugars100(product.sugars100 !== undefined ? String(product.sugars100) : "");
    setSatFat100(product.satFat100 !== undefined ? String(product.satFat100) : "");
    setTransFat100(product.transFat100 !== undefined ? String(product.transFat100) : "");
    setFiber100(product.fiber100 !== undefined ? String(product.fiber100) : "");
    setSodiumMg100(product.sodiumMg100 !== undefined ? String(product.sodiumMg100) : "");
    setSugarTsp100(product.sugarTeaspoons100 !== undefined ? String(product.sugarTeaspoons100) : "");
    setTotalWeight(String(product.totalWeight));
    setUnits(String(product.units));
    setFormError(null);
  }, [product]);

  if (!product) return null;

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!product) return;
    setFormError(null);
    const n = name.trim();
    if (!n) {
      setFormError("נא להזין שם מוצר.");
      return;
    }
    const tw = parseNum(totalWeight);
    const u = parseNum(units);
    if (!(tw > 0) || !(u > 0)) {
      setFormError("משקל כולל ומספר יחידות חייבים להיות מספרים חיוביים.");
      return;
    }
    const c100 = parseNum(cals100);
    if (!Number.isFinite(c100)) {
      setFormError("נא להזין קלוריות ל-100 גרם.");
      return;
    }
    const p100 = parseNum(prot100);
    const cb100 = parseNum(carb100);
    const f100 = parseNum(fat100);
    const sug100 = parseNum(sugars100);
    const sat100 = parseNum(satFat100);
    const trans100 = parseNum(transFat100);
    const fib100 = parseNum(fiber100);
    const sod100 = parseNum(sodiumMg100);
    const tsp100 = parseNum(sugarTsp100);

    const payload = buildProductPayload(
      {
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
      },
      product.id,
      new Date().toISOString(),
    );

    setSaving(true);
    try {
      await onSave(payload);
      onClose();
    } catch {
      /* toast from parent */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-product-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/75 backdrop-blur-[2px]"
        aria-label="סגירה"
        onClick={onClose}
      />
      <div className="relative z-10 mx-4 mb-[max(1rem,env(safe-area-inset-bottom))] w-full max-w-lg rounded-2xl border border-white/15 bg-neutral-950 p-5 shadow-2xl sm:mb-0">
        <h2
          id="edit-product-title"
          className="font-display text-xl font-semibold text-white"
        >
          עריכת מוצר
        </h2>
        <form onSubmit={handleSubmit} className="mt-4 max-h-[min(70vh,520px)] space-y-3 overflow-y-auto pr-1">
          <Field id="edit-name" label="שם המוצר" value={name} onChange={setName} />
          <Field id="edit-brand" label="מותג" value={brand} onChange={setBrand} />
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="edit-cals100"
              label="קלוריות ל-100 גרם"
              value={cals100}
              onChange={setCals100}
              inputMode="decimal"
            />
            <Field
              id="edit-prot100"
              label="חלבון (ל-100 גרם)"
              value={prot100}
              onChange={setProt100}
              inputMode="decimal"
            />
            <Field
              id="edit-carb100"
              label="פחמימות (ל-100 גרם)"
              value={carb100}
              onChange={setCarb100}
              inputMode="decimal"
            />
            <Field
              id="edit-fat100"
              label="שומן (ל-100 גרם)"
              value={fat100}
              onChange={setFat100}
              inputMode="decimal"
            />
            <Field
              id="edit-sugars100"
              label="סוכרים (ל-100 גרם)"
              value={sugars100}
              onChange={setSugars100}
              inputMode="decimal"
            />
            <Field
              id="edit-sat100"
              label="שומן רווי (ל-100 גרם)"
              value={satFat100}
              onChange={setSatFat100}
              inputMode="decimal"
            />
            <Field
              id="edit-trans100"
              label="שומן טראנס (ל-100 גרם)"
              value={transFat100}
              onChange={setTransFat100}
              inputMode="decimal"
            />
            <Field
              id="edit-fiber100"
              label="סיבים (ל-100 גרם)"
              value={fiber100}
              onChange={setFiber100}
              inputMode="decimal"
            />
            <Field
              id="edit-sodium100"
              label="נתרן (מ״ג ל-100 גרם)"
              value={sodiumMg100}
              onChange={setSodiumMg100}
              inputMode="decimal"
            />
            <Field
              id="edit-sugar-tsp"
              label="כפיות סוכר (ל-100 גרם)"
              value={sugarTsp100}
              onChange={setSugarTsp100}
              inputMode="decimal"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field
              id="edit-tw"
              label="משקל כולל (גרם)"
              value={totalWeight}
              onChange={setTotalWeight}
              inputMode="decimal"
            />
            <Field
              id="edit-units"
              label="מספר יחידות"
              value={units}
              onChange={setUnits}
              inputMode="numeric"
            />
          </div>
          {formError ? (
            <p className="text-sm text-red-300">{formError}</p>
          ) : null}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="min-h-[48px] flex-1 rounded-xl border border-white/20 text-sm font-medium text-ink-muted transition hover:border-white/30 hover:text-white"
            >
              ביטול
            </button>
            <button
              type="submit"
              disabled={saving}
              className="min-h-[48px] flex-1 rounded-xl bg-white text-sm font-semibold text-black transition enabled:active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? "שומר…" : "שמור"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
