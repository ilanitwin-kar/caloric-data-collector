import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onValue, ref, remove, set, update, type DataSnapshot } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { normalizeBarcode } from "../utils/openFoodFacts";

export type CatalogNutritionPer100g = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  sugarsG?: number;
  fatG?: number;
  satFatG?: number;
  fiberG?: number;
  sodiumMg?: number;
};

export type CatalogNutritionPerUnit = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  sugarsG?: number;
  fatG?: number;
  satFatG?: number;
  fiberG?: number;
  sodiumMg?: number;
};

export type CatalogPackage = {
  /** Weight of full package in grams. */
  totalWeightG?: number;
  /** Units in package (e.g. 6 bars). */
  unitsPerPack?: number;
  /** Derived. */
  unitWeightG?: number;
};

export type CatalogProduct = {
  gtin: string;
  name: string;
  brand?: string;
  createdAt: string;
  updatedAt: string;
  quantityText?: string;
  quantityG?: number;
  servingSizeText?: string;
  servingG?: number;
  ingredientsText?: string;
  allergensText?: string;
  categoriesText?: string;
  images?: {
    frontUrl?: string;
    nutritionUrl?: string;
    ingredientsUrl?: string;
    /** Uploaded to Firebase Storage (private). */
    labelUploadedUrl?: string;
    labelUploadedPath?: string;
  };
  sources?: Array<{
    type: "barcode_openfoodfacts" | "ocr" | "manual";
    at: string;
  }>;
  package?: CatalogPackage;
  nutrition?: {
    per100g?: CatalogNutritionPer100g;
    perUnit?: CatalogNutritionPerUnit;
  };
};

type CatalogSourceType = NonNullable<CatalogProduct["sources"]>[number]["type"];

type CatalogContextValue = {
  catalog: CatalogProduct[];
  loading: boolean;
  error: string | null;
  upsertByBarcode: (input: {
    barcode: string;
    name: string;
    brand?: string;
    per100: CatalogNutritionPer100g;
    totalWeightG?: number;
    unitsPerPack?: number;
    quantityText?: string;
    quantityG?: number;
    servingSizeText?: string;
    servingG?: number;
    ingredientsText?: string;
    allergensText?: string;
    categoriesText?: string;
    images?: CatalogProduct["images"];
    sourceType: CatalogSourceType;
  }) => Promise<void>;
  updateProduct: (product: CatalogProduct) => Promise<void>;
  bulkUpsert: (products: CatalogProduct[], opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void }) => Promise<void>;
  deleteProduct: (gtin: string) => Promise<void>;
};

const CatalogContext = createContext<CatalogContextValue | null>(null);

function cleanForRtdb<T>(value: T): T {
  // RTDB rejects `undefined` anywhere in the payload.
  return JSON.parse(JSON.stringify(value)) as T;
}

function computePerUnit(
  per100: CatalogNutritionPer100g,
  unitWeightG?: number,
): CatalogNutritionPerUnit {
  if (!unitWeightG || !Number.isFinite(unitWeightG) || unitWeightG <= 0) return {};
  const factor = unitWeightG / 100;
  const mul = (x?: number) =>
    typeof x === "number" && Number.isFinite(x) ? x * factor : undefined;
  return {
    calories: mul(per100.calories),
    proteinG: mul(per100.proteinG),
    carbsG: mul(per100.carbsG),
    sugarsG: mul(per100.sugarsG),
    fatG: mul(per100.fatG),
    satFatG: mul(per100.satFatG),
    fiberG: mul(per100.fiberG),
    sodiumMg: mul(per100.sodiumMg),
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stuckHint, setStuckHint] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setCatalog([]);
      setLoading(false);
      setError(null);
      setStuckHint(null);
      return;
    }
    setLoading(true);
    setStuckHint(null);
    const r = ref(db, `users/${user.uid}/catalog/products`);
    let gotData = false;
    const stuckTimer = window.setTimeout(() => {
      if (!gotData) {
        setStuckHint(
          "הטעינה מהענן נמשכת יותר מדי זמן. בדקי חיבור לאינטרנט, רענני את העמוד, או נקי קאש של האפליקציה (PWA).",
        );
      }
    }, 12000);
    const unsub = onValue(
      r,
      (snap: DataSnapshot) => {
        gotData = true;
        window.clearTimeout(stuckTimer);
        const v = snap.val() as Record<string, CatalogProduct> | null;
        const list = v ? Object.values(v) : [];
        list.sort(
          (a, b) =>
            new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
        );
        setCatalog(list);
        setError(null);
        setLoading(false);
        setStuckHint(null);
      },
      (err) => {
        gotData = true;
        window.clearTimeout(stuckTimer);
        setError(err.message);
        setLoading(false);
        setStuckHint(null);
      },
    );
    return () => {
      window.clearTimeout(stuckTimer);
      unsub();
    };
  }, [user]);

  const upsertByBarcode = useCallback(
    async (input: {
      barcode: string;
      name: string;
      brand?: string;
      per100: CatalogNutritionPer100g;
      totalWeightG?: number;
      unitsPerPack?: number;
      quantityText?: string;
      quantityG?: number;
      servingSizeText?: string;
      servingG?: number;
      ingredientsText?: string;
      allergensText?: string;
      categoriesText?: string;
      images?: CatalogProduct["images"];
      sourceType: CatalogSourceType;
    }) => {
      if (!user) {
        showToast("צריך להתחבר כדי לשמור לקטלוג", "error");
        return;
      }

      const gtin = normalizeBarcode(input.barcode);
      if (gtin.length < 8) {
        showToast("ברקוד לא תקין", "error");
        return;
      }

      const now = new Date().toISOString();
      const units =
        typeof input.unitsPerPack === "number" && input.unitsPerPack > 0
          ? input.unitsPerPack
          : undefined;
      const totalW =
        typeof input.totalWeightG === "number" && input.totalWeightG > 0
          ? input.totalWeightG
          : undefined;
      const unitWeightG =
        totalW !== undefined && units !== undefined ? totalW / units : undefined;

      const payload: CatalogProduct = {
        gtin,
        name: input.name.trim(),
        brand: input.brand?.trim() || undefined,
        createdAt: now,
        updatedAt: now,
        sources: [{ type: input.sourceType, at: now }],
        quantityText: input.quantityText?.trim() || undefined,
        quantityG:
          typeof input.quantityG === "number" && input.quantityG > 0
            ? input.quantityG
            : undefined,
        servingSizeText: input.servingSizeText?.trim() || undefined,
        servingG:
          typeof input.servingG === "number" && input.servingG > 0
            ? input.servingG
            : undefined,
        ingredientsText: input.ingredientsText?.trim() || undefined,
        allergensText: input.allergensText?.trim() || undefined,
        categoriesText: input.categoriesText?.trim() || undefined,
        images: input.images,
        package: {
          totalWeightG: totalW,
          unitsPerPack: units,
          unitWeightG,
        },
        nutrition: {
          per100g: {
            calories: input.per100.calories,
            proteinG: input.per100.proteinG,
            carbsG: input.per100.carbsG,
            sugarsG: input.per100.sugarsG,
            fatG: input.per100.fatG,
            satFatG: input.per100.satFatG,
            fiberG: input.per100.fiberG,
            sodiumMg: input.per100.sodiumMg,
          },
          perUnit: computePerUnit(input.per100, unitWeightG),
        },
      };

      await set(
        ref(db, `users/${user.uid}/catalog/products/${gtin}`),
        cleanForRtdb(payload),
      );
      showToast("נשמר לקטלוג לפי ברקוד", "success");
    },
    [user, showToast],
  );

  const updateProduct = useCallback(
    async (product: CatalogProduct) => {
      if (!user) {
        showToast("צריך להתחבר כדי לעדכן", "error");
        return;
      }
      const gtin = normalizeBarcode(product.gtin);
      if (gtin.length < 8) {
        showToast("ברקוד לא תקין", "error");
        return;
      }
      const now = new Date().toISOString();
      const next: CatalogProduct = { ...product, gtin, updatedAt: now };
      await set(ref(db, `users/${user.uid}/catalog/products/${gtin}`), cleanForRtdb(next));
      showToast("מוצר עודכן בקטלוג", "success");
    },
    [user, showToast],
  );

  const bulkUpsert = useCallback(
    async (
      products: CatalogProduct[],
      opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void },
    ) => {
      if (!user) {
        showToast("צריך להתחבר כדי לשמור לקטלוג", "error");
        return;
      }
      const chunkSize = Math.max(1, Math.min(500, opts?.chunkSize ?? 250));
      const basePath = `users/${user.uid}/catalog/products`;
      const total = products.length;
      let done = 0;

      // Write in multi-location updates to reduce requests drastically.
      // Chunking avoids exceeding RTDB payload limits (approx 16MB).
      for (let i = 0; i < products.length; i += chunkSize) {
        const chunk = products.slice(i, i + chunkSize);
        const now = new Date().toISOString();
        const updates: Record<string, CatalogProduct> = {};
        for (const p of chunk) {
          const gtin = normalizeBarcode(p.gtin);
          if (gtin.length < 8) continue;
          updates[`${basePath}/${gtin}`] = cleanForRtdb({ ...p, gtin, updatedAt: now });
        }
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
        done = Math.min(total, i + chunk.length);
        opts?.onProgress?.(done, total);
      }
      showToast("הייבוא הסתיים", "success");
    },
    [user, showToast],
  );

  const deleteProduct = useCallback(
    async (gtin: string) => {
      if (!user) {
        showToast("צריך להתחבר כדי למחוק", "error");
        return;
      }
      const code = normalizeBarcode(gtin);
      if (code.length < 8) {
        showToast("ברקוד לא תקין", "error");
        return;
      }
      await remove(ref(db, `users/${user.uid}/catalog/products/${code}`));
      showToast("נמחק מהקטלוג", "success");
    },
    [user, showToast],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      catalog,
      loading,
      error: error ?? stuckHint,
      upsertByBarcode,
      updateProduct,
      bulkUpsert,
      deleteProduct,
    }),
    [catalog, loading, error, stuckHint, upsertByBarcode, updateProduct, bulkUpsert, deleteProduct],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

