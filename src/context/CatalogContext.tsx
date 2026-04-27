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
  fatG?: number;
};

export type CatalogNutritionPerUnit = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

export type CatalogPackage = {
  /** Weight of full package in grams. */
  totalWeightG?: number;
  /** Units in package (e.g. 6 bars). */
  unitsPerPack?: number;
  /** Derived. */
  unitWeightG?: number;
};

export type CatalogMeasures = {
  /** Pieces per 100g (so grams per piece = 100/unitsPer100g). */
  unitsPer100g?: number;
  /** Tablespoons per 100g (so grams per tbsp = 100/tbspPer100g). */
  tbspPer100g?: number;
  /** Teaspoons per 100g (so grams per tsp = 100/tspPer100g). */
  tspPer100g?: number;
  /** Cups per 100g (so grams per cup = 100/cupsPer100g). */
  cupsPer100g?: number;
};

export type CatalogUsageTag = "ready" | "ingredient" | "raw" | "cooked" | "dry";
export type CatalogMeasureKey = "unit" | "tbsp" | "tsp" | "cup" | "g100";

export type CatalogProduct = {
  /**
   * Key in the catalog.
   * - Barcode products: normalized digits (EAN/GTIN).
   * - Internal products: "internal:<uuid>".
   */
  id: string;
  /** Barcode digits when available (EAN/GTIN). */
  gtin?: string;
  name: string;
  brand?: string;
  /** Extra free-form search terms (slang, aliases, etc.). */
  keywords?: string[];
  /** Optional category (e.g. "שימורים"). */
  category?: string;
  /** How this item is typically used (supports multiple tags). */
  usageTags?: CatalogUsageTag[];
  /** Default measure to use in the journal UI. */
  defaultMeasure?: CatalogMeasureKey;
  /** Common measures to quickly choose from (2-4 recommended). */
  commonMeasures?: CatalogMeasureKey[];
  createdAt: string;
  updatedAt: string;
  sources?: Array<{
    type: "barcode_openfoodfacts" | "ocr" | "manual";
    at: string;
  }>;
  package?: CatalogPackage;
  measures?: CatalogMeasures;
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
  /** User stopped the realtime listener (spinner won’t hang forever). */
  cloudSyncPaused: boolean;
  pauseCloudSync: () => void;
  resumeCloudSync: () => void;
  upsertByBarcode: (input: {
    barcode: string;
    name: string;
    brand?: string;
    keywords?: string[];
    category?: string;
    usageTags?: CatalogUsageTag[];
    defaultMeasure?: CatalogMeasureKey;
    commonMeasures?: CatalogMeasureKey[];
    per100: CatalogNutritionPer100g;
    totalWeightG?: number;
    unitsPerPack?: number;
    measures?: CatalogMeasures;
    sourceType: CatalogSourceType;
  }) => Promise<void>;
  upsertInternal: (input: {
    id: string;
    name: string;
    brand?: string;
    keywords?: string[];
    category?: string;
    usageTags?: CatalogUsageTag[];
    defaultMeasure?: CatalogMeasureKey;
    commonMeasures?: CatalogMeasureKey[];
    per100: CatalogNutritionPer100g;
    totalWeightG?: number;
    unitsPerPack?: number;
    measures?: CatalogMeasures;
    sourceType: CatalogSourceType;
  }) => Promise<void>;
  updateProduct: (product: CatalogProduct) => Promise<void>;
  bulkUpsert: (products: CatalogProduct[], opts?: { chunkSize?: number; onProgress?: (done: number, total: number) => void }) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
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
    fatG: mul(per100.fatG),
  };
}

export function CatalogProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [catalog, setCatalog] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stuckHint, setStuckHint] = useState<string | null>(null);
  const [cloudSyncPaused, setCloudSyncPaused] = useState(false);

  const pauseCloudSync = useCallback(() => {
    setCloudSyncPaused(true);
    setLoading(false);
  }, []);

  const resumeCloudSync = useCallback(() => {
    setCloudSyncPaused(false);
    setStuckHint(null);
    setError(null);
  }, []);

  useEffect(() => {
    if (!user) {
      setCatalog([]);
      setLoading(false);
      setError(null);
      setStuckHint(null);
      setCloudSyncPaused(false);
      return;
    }
    if (cloudSyncPaused) {
      setLoading(false);
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
  }, [user, cloudSyncPaused]);

  const upsertByBarcode = useCallback(
    async (input: {
      barcode: string;
      name: string;
      brand?: string;
      keywords?: string[];
      category?: string;
      usageTags?: CatalogUsageTag[];
      defaultMeasure?: CatalogMeasureKey;
      commonMeasures?: CatalogMeasureKey[];
      per100: CatalogNutritionPer100g;
      totalWeightG?: number;
      unitsPerPack?: number;
      measures?: CatalogMeasures;
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
      const id = gtin;
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
        id,
        gtin,
        name: input.name.trim(),
        brand: input.brand?.trim() || undefined,
        keywords:
          input.keywords?.filter((k) => k.trim()).map((k) => k.trim()) ?? undefined,
        category: input.category?.trim() || undefined,
        usageTags: input.usageTags?.length ? input.usageTags : undefined,
        defaultMeasure: input.defaultMeasure ?? "unit",
        commonMeasures:
          input.commonMeasures?.length ? input.commonMeasures : [input.defaultMeasure ?? "unit", "g100"],
        createdAt: now,
        updatedAt: now,
        sources: [{ type: input.sourceType, at: now }],
        package: {
          totalWeightG: totalW,
          unitsPerPack: units,
          unitWeightG,
        },
        measures: input.measures,
        nutrition: {
          per100g: {
            calories: input.per100.calories,
            proteinG: input.per100.proteinG,
            carbsG: input.per100.carbsG,
            fatG: input.per100.fatG,
          },
          perUnit: computePerUnit(input.per100, unitWeightG),
        },
      };

      await set(
        ref(db, `users/${user.uid}/catalog/products/${id}`),
        cleanForRtdb(payload),
      );
      showToast("נשמר לקטלוג לפי ברקוד", "success");
    },
    [user, showToast],
  );

  const upsertInternal = useCallback(
    async (input: {
      id: string;
      name: string;
      brand?: string;
      keywords?: string[];
      category?: string;
      usageTags?: CatalogUsageTag[];
      defaultMeasure?: CatalogMeasureKey;
      commonMeasures?: CatalogMeasureKey[];
      per100: CatalogNutritionPer100g;
      totalWeightG?: number;
      unitsPerPack?: number;
      measures?: CatalogMeasures;
      sourceType: CatalogSourceType;
    }) => {
      if (!user) {
        showToast("צריך להתחבר כדי לשמור לקטלוג", "error");
        return;
      }

      const id = input.id.trim();
      if (!id || !id.startsWith("internal:")) {
        showToast("מזהה פנימי לא תקין", "error");
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
        id,
        name: input.name.trim(),
        brand: input.brand?.trim() || undefined,
        keywords:
          input.keywords?.filter((k) => k.trim()).map((k) => k.trim()) ?? undefined,
        category: input.category?.trim() || undefined,
        usageTags: input.usageTags?.length ? input.usageTags : undefined,
        defaultMeasure: input.defaultMeasure ?? "g100",
        commonMeasures:
          input.commonMeasures?.length ? input.commonMeasures : [input.defaultMeasure ?? "g100", "unit"],
        createdAt: now,
        updatedAt: now,
        sources: [{ type: input.sourceType, at: now }],
        package: {
          totalWeightG: totalW,
          unitsPerPack: units,
          unitWeightG,
        },
        measures: input.measures,
        nutrition: {
          per100g: {
            calories: input.per100.calories,
            proteinG: input.per100.proteinG,
            carbsG: input.per100.carbsG,
            fatG: input.per100.fatG,
          },
          perUnit: computePerUnit(input.per100, unitWeightG),
        },
      };

      await set(
        ref(db, `users/${user.uid}/catalog/products/${id}`),
        cleanForRtdb(payload),
      );
      showToast("נשמר לקטלוג", "success");
    },
    [user, showToast],
  );

  const updateProduct = useCallback(
    async (product: CatalogProduct) => {
      if (!user) {
        showToast("צריך להתחבר כדי לעדכן", "error");
        return;
      }
      const now = new Date().toISOString();
      const key =
        product.id?.startsWith("internal:")
          ? product.id
          : normalizeBarcode(product.gtin ?? product.id);
      if (!key) {
        showToast("מזהה מוצר לא תקין", "error");
        return;
      }
      const next: CatalogProduct = { ...product, id: key, updatedAt: now };
      await set(ref(db, `users/${user.uid}/catalog/products/${key}`), cleanForRtdb(next));
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
          const key =
            p.id?.startsWith("internal:")
              ? p.id
              : normalizeBarcode(p.gtin ?? p.id);
          if (!key || key.length < 6) continue;
          updates[`${basePath}/${key}`] = cleanForRtdb({ ...p, id: key, updatedAt: now });
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
    async (id: string) => {
      if (!user) {
        showToast("צריך להתחבר כדי למחוק", "error");
        return;
      }
      const key = id.startsWith("internal:") ? id : normalizeBarcode(id);
      if (!key) {
        showToast("מזהה לא תקין", "error");
        return;
      }
      await remove(ref(db, `users/${user.uid}/catalog/products/${key}`));
      showToast("נמחק מהקטלוג", "success");
    },
    [user, showToast],
  );

  const value = useMemo<CatalogContextValue>(
    () => ({
      catalog,
      loading,
      error: error ?? stuckHint,
      cloudSyncPaused,
      pauseCloudSync,
      resumeCloudSync,
      upsertByBarcode,
      upsertInternal,
      updateProduct,
      bulkUpsert,
      deleteProduct,
    }),
    [
      catalog,
      loading,
      error,
      stuckHint,
      cloudSyncPaused,
      pauseCloudSync,
      resumeCloudSync,
      upsertByBarcode,
      upsertInternal,
      updateProduct,
      bulkUpsert,
      deleteProduct,
    ],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

