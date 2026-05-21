import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onValue, push, ref, remove, set, update, type DataSnapshot } from "firebase/database";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";
import { normalizeBarcode } from "../utils/openFoodFacts";
import {
  buildCatalogProductFromOffRecord,
  catalogEntryBlocksOffImport,
  toOffPendingReview,
  type OffPendingReview,
} from "../utils/offCatalog";
import { isOffImportedCatalogProduct } from "../utils/offCatalogPolicy";
import { fetchOffIsraelProductPages } from "../utils/offIsraelImport";
import type { Verified100Row } from "../utils/verifiedTsv";

export type OffImportCheckpoint = {
  nextPage: number;
  stopReason: "rate_limited" | "complete";
  updatedAt: string;
};

export type CatalogNutritionPer100g = {
  calories?: number;
  proteinG?: number;
  carbsG?: number;
  fatG?: number;
};

export type CatalogPer100Basis = "g" | "ml";

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
  /** Optional shorter display name for the journal UI. */
  shortName?: string;
  brand?: string;
  /** Extra free-form search terms (slang, aliases, etc.). */
  keywords?: string[];
  /** Optional category (e.g. "שימורים"). */
  category?: string;
  /** How this item is typically used (supports multiple tags). */
  usageTags?: CatalogUsageTag[];
  /** Are nutrition values per 100g or per 100ml (as on label). */
  per100Basis?: CatalogPer100Basis;
  /** Default measure to use in the journal UI. */
  defaultMeasure?: CatalogMeasureKey;
  /** Common measures to quickly choose from (2-4 recommended). */
  commonMeasures?: CatalogMeasureKey[];
  createdAt: string;
  updatedAt: string;
  sources?: Array<{
    type: "barcode_openfoodfacts" | "ocr" | "manual" | "verified100";
    at: string;
  }>;
  package?: CatalogPackage;
  measures?: CatalogMeasures;
  nutrition?: {
    per100g?: CatalogNutritionPer100g;
    perUnit?: CatalogNutritionPerUnit;
  };
};

export type SupermarketTrip = {
  id: string;
  name: string;
  category: string;
  createdAt: string;
  updatedAt: string;
};

/** Partial catalog row saved from the supermarket quick screen for later completion on Home. */
export type SupermarketDraft = {
  id: string;
  tripId: string;
  tripNameSnapshot?: string;
  tripCategorySnapshot?: string;
  barcodeRaw: string;
  isInternal?: boolean;
  internalId?: string;
  name: string;
  shortName?: string;
  brand?: string;
  keywordsRaw?: string;
  category?: string;
  usageTags?: CatalogUsageTag[];
  defaultMeasure?: CatalogMeasureKey;
  commonMeasures?: CatalogMeasureKey[];
  per100Basis: CatalogPer100Basis;
  calories100?: number;
  protein100?: number;
  carbs100?: number;
  fat100?: number;
  totalWeightG?: number;
  unitsPerPack?: number;
  unitWeightG?: number;
  measures?: CatalogMeasures;
  createdAt: string;
  updatedAt: string;
};

export type SupermarketDraftPayload = Omit<SupermarketDraft, "id" | "createdAt" | "updatedAt">;

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
    shortName?: string;
    brand?: string;
    keywords?: string[];
    category?: string;
    usageTags?: CatalogUsageTag[];
    per100Basis?: CatalogPer100Basis;
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
    shortName?: string;
    brand?: string;
    keywords?: string[];
    category?: string;
    usageTags?: CatalogUsageTag[];
    per100Basis?: CatalogPer100Basis;
    defaultMeasure?: CatalogMeasureKey;
    commonMeasures?: CatalogMeasureKey[];
    per100: CatalogNutritionPer100g;
    totalWeightG?: number;
    unitsPerPack?: number;
    measures?: CatalogMeasures;
    sourceType: CatalogSourceType;
  }) => Promise<void>;
  updateProduct: (product: CatalogProduct) => Promise<void>;
  bulkUpsert: (
    products: CatalogProduct[],
    opts?: {
      chunkSize?: number;
      silent?: boolean;
      onProgress?: (done: number, total: number) => void;
    },
  ) => Promise<void>;
  importOpenFoodFactsIsrael: (
    verifiedItems: Verified100Row[],
    opts?: {
      startPage?: number;
      signal?: AbortSignal;
      onProgress?: (p: {
        phase: "fetch" | "write";
        page?: number;
        scanned: number;
        skipped: number;
        queued: number;
        written: number;
      }) => void;
    },
  ) => Promise<{
    scanned: number;
    skipped: number;
    queued: number;
    verifiedOverrides: number;
    completed: boolean;
    stoppedEarly: boolean;
    resumeNextPage?: number;
    totalOffReported?: number;
  }>;
  offImportCheckpoint: OffImportCheckpoint | null;
  offImportCheckpointReady: boolean;
  clearOffImportCheckpoint: () => Promise<void>;
  purgeOffImportedFromCatalog: () => Promise<{ removed: number; kept: number }>;
  offPendingReviews: OffPendingReview[];
  offPendingReady: boolean;
  approveOffPendingReview: (item: OffPendingReview) => Promise<void>;
  rejectOffPendingReview: (id: string) => Promise<void>;
  updateOffPendingReview: (item: OffPendingReview) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  supermarketTrips: SupermarketTrip[];
  supermarketDrafts: SupermarketDraft[];
  /** True after first RTDB snapshot for supermarket trips. */
  supermarketTripsReady: boolean;
  /** True after the first RTDB snapshot for supermarket drafts (even if empty). */
  supermarketDraftsReady: boolean;
  createSupermarketTrip: (input: { name: string; category: string }) => Promise<string | null>;
  addSupermarketDraft: (payload: SupermarketDraftPayload) => Promise<string | null>;
  deleteSupermarketDraft: (id: string) => Promise<void>;
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
  const [supermarketTrips, setSupermarketTrips] = useState<SupermarketTrip[]>([]);
  const [supermarketTripsReady, setSupermarketTripsReady] = useState(false);
  const [supermarketDrafts, setSupermarketDrafts] = useState<SupermarketDraft[]>([]);
  const [supermarketDraftsReady, setSupermarketDraftsReady] = useState(false);
  const [offPendingReviews, setOffPendingReviews] = useState<OffPendingReview[]>([]);
  const [offPendingReady, setOffPendingReady] = useState(false);
  const [offImportCheckpoint, setOffImportCheckpoint] = useState<OffImportCheckpoint | null>(
    null,
  );
  const [offImportCheckpointReady, setOffImportCheckpointReady] = useState(false);
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
      setSupermarketTrips([]);
      setSupermarketDrafts([]);
      setSupermarketDraftsReady(false);
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

  useEffect(() => {
    if (!user || cloudSyncPaused) {
      setSupermarketTrips([]);
      setSupermarketDrafts([]);
      setOffPendingReviews([]);
      setOffImportCheckpoint(null);
      setSupermarketTripsReady(false);
      setSupermarketDraftsReady(false);
      setOffPendingReady(false);
      setOffImportCheckpointReady(false);
      return;
    }
    const rt = ref(db, `users/${user.uid}/catalog/supermarketTrips`);
    const rd = ref(db, `users/${user.uid}/catalog/supermarketDrafts`);
    const ro = ref(db, `users/${user.uid}/catalog/offPendingReview`);
    const rck = ref(db, `users/${user.uid}/catalog/meta/offImportCheckpoint`);
    const unsubTrips = onValue(rt, (snap: DataSnapshot) => {
      setSupermarketTripsReady(true);
      const v = snap.val() as Record<string, Omit<SupermarketTrip, "id">> | null;
      const list: SupermarketTrip[] = v
        ? Object.entries(v).map(([id, rest]) => ({ id, ...rest } as SupermarketTrip))
        : [];
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setSupermarketTrips(list);
    });
    const unsubDrafts = onValue(rd, (snap: DataSnapshot) => {
      setSupermarketDraftsReady(true);
      const v = snap.val() as Record<string, Omit<SupermarketDraft, "id">> | null;
      const list: SupermarketDraft[] = v
        ? Object.entries(v).map(([id, rest]) => ({ id, ...rest } as SupermarketDraft))
        : [];
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setSupermarketDrafts(list);
    });
    const unsubOff = onValue(ro, (snap: DataSnapshot) => {
      setOffPendingReady(true);
      const v = snap.val() as Record<string, OffPendingReview> | null;
      const list = v ? Object.values(v) : [];
      list.sort(
        (a, b) =>
          new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
      );
      setOffPendingReviews(list);
    });
    const unsubCk = onValue(rck, (snap: DataSnapshot) => {
      setOffImportCheckpointReady(true);
      const v = snap.val() as OffImportCheckpoint | null;
      setOffImportCheckpoint(v && v.nextPage > 0 ? v : null);
    });
    return () => {
      unsubTrips();
      unsubDrafts();
      unsubOff();
      unsubCk();
    };
  }, [user, cloudSyncPaused]);

  const upsertByBarcode = useCallback(
    async (input: {
      barcode: string;
      name: string;
      shortName?: string;
      brand?: string;
      keywords?: string[];
      category?: string;
      usageTags?: CatalogUsageTag[];
      per100Basis?: CatalogPer100Basis;
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
        shortName: input.shortName?.trim() || undefined,
        brand: input.brand?.trim() || undefined,
        keywords:
          input.keywords?.filter((k) => k.trim()).map((k) => k.trim()) ?? undefined,
        category: input.category?.trim() || undefined,
        usageTags: input.usageTags?.length ? input.usageTags : undefined,
        per100Basis: input.per100Basis ?? "g",
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
      shortName?: string;
      brand?: string;
      keywords?: string[];
      category?: string;
      usageTags?: CatalogUsageTag[];
      per100Basis?: CatalogPer100Basis;
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

      const inferredDefaultMeasure: CatalogMeasureKey =
        units !== undefined && totalW !== undefined ? "unit" : "g100";

      const payload: CatalogProduct = {
        id,
        name: input.name.trim(),
        shortName: input.shortName?.trim() || undefined,
        brand: input.brand?.trim() || undefined,
        keywords:
          input.keywords?.filter((k) => k.trim()).map((k) => k.trim()) ?? undefined,
        category: input.category?.trim() || undefined,
        usageTags: input.usageTags?.length ? input.usageTags : undefined,
        per100Basis: input.per100Basis ?? "g",
        defaultMeasure: input.defaultMeasure ?? inferredDefaultMeasure,
        commonMeasures: input.commonMeasures?.length
          ? input.commonMeasures
          : (Array.from(
              new Set<CatalogMeasureKey>([input.defaultMeasure ?? inferredDefaultMeasure, "unit", "g100"]),
            ).slice(0, 4) as CatalogMeasureKey[]),
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
      opts?: {
        chunkSize?: number;
        silent?: boolean;
        onProgress?: (done: number, total: number) => void;
      },
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
      if (!opts?.silent) showToast("הייבוא הסתיים", "success");
    },
    [user, showToast],
  );

  const importOpenFoodFactsIsrael = useCallback(
    async (
      verifiedItems: Verified100Row[],
      opts?: {
        startPage?: number;
        signal?: AbortSignal;
        onProgress?: (p: {
          phase: "fetch" | "write";
          page?: number;
          scanned: number;
          skipped: number;
          queued: number;
          written: number;
        }) => void;
      },
    ) => {
      if (!user) {
        showToast("צריך להתחבר כדי לייבא", "error");
        return {
          scanned: 0,
          skipped: 0,
          queued: 0,
          verifiedOverrides: 0,
          completed: false,
          stoppedEarly: false,
        };
      }

      const startPage =
        opts?.startPage ??
        (offImportCheckpoint?.stopReason === "rate_limited"
          ? offImportCheckpoint.nextPage
          : 1);

      const existingById = new Map<string, CatalogProduct>();
      for (const p of catalog) {
        const key = p.id.startsWith("internal:")
          ? p.id
          : normalizeBarcode(p.gtin ?? p.id);
        if (key.length >= 6) existingById.set(key, p);
      }
      const existingOffPending = new Set(
        offPendingReviews.map((p) => normalizeBarcode(p.gtin ?? p.id)).filter((k) => k.length >= 8),
      );

      let scanned = 0;
      let skipped = 0;
      let queued = 0;
      let written = 0;
      let verifiedOverrides = 0;
      const pending: OffPendingReview[] = [];
      const seenGtin = new Set<string>();
      const basePath = `users/${user.uid}/catalog/offPendingReview`;

      const flushPending = async () => {
        if (pending.length === 0) return;
        const batch = pending.splice(0, pending.length);
        const updates: Record<string, OffPendingReview> = {};
        const now = new Date().toISOString();
        for (const item of batch) {
          const key = normalizeBarcode(item.gtin ?? item.id);
          if (key.length < 8) continue;
          updates[`${basePath}/${key}`] = cleanForRtdb({ ...item, id: key, updatedAt: now });
        }
        if (Object.keys(updates).length > 0) {
          await update(ref(db), updates);
        }
        written += batch.length;
        opts?.onProgress?.({
          phase: "write",
          scanned,
          skipped,
          queued: pending.length,
          written,
        });
      };

      const ckPath = `users/${user.uid}/catalog/meta/offImportCheckpoint`;

      try {
        const gen = fetchOffIsraelProductPages({
          signal: opts?.signal,
          startPage,
          onPage: ({ page }) => {
            opts?.onProgress?.({
              phase: "fetch",
              page,
              scanned,
              skipped,
              queued: pending.length,
              written,
            });
          },
        });

        let iter = await gen.next();
        while (!iter.done) {
          const page = iter.value;
          for (const record of page) {
            scanned += 1;
            const built = buildCatalogProductFromOffRecord(record, verifiedItems);
            if (!built) {
              skipped += 1;
              continue;
            }
            const gtin = built.product.id;
            if (seenGtin.has(gtin) || existingOffPending.has(gtin)) {
              skipped += 1;
              continue;
            }
            seenGtin.add(gtin);

            if (catalogEntryBlocksOffImport(existingById.get(gtin))) {
              skipped += 1;
              continue;
            }

            if (built.usedVerified) verifiedOverrides += 1;
            pending.push(toOffPendingReview(built));
            queued += 1;

            if (pending.length >= 250) await flushPending();

            if (scanned % 50 === 0) {
              opts?.onProgress?.({
                phase: "fetch",
                scanned,
                skipped,
                queued: pending.length,
                written,
              });
            }
          }
          iter = await gen.next();
        }

        await flushPending();

        const summary = iter.value;
        if (summary.stopReason === "rate_limited") {
          const nextPage = summary.lastPageFetched + 1;
          await set(ref(db, ckPath), {
            nextPage,
            stopReason: "rate_limited",
            updatedAt: new Date().toISOString(),
          });
          showToast(
            `ייבוא נעצר בעמוד ${summary.lastPageFetched} (מגבלת OFF). אפשר להמשיך מאוחר יותר.`,
            "error",
          );
          return {
            scanned,
            skipped,
            queued,
            verifiedOverrides,
            completed: false,
            stoppedEarly: true,
            resumeNextPage: nextPage,
            totalOffReported: summary.totalReportedCount,
          };
        }

        await remove(ref(db, ckPath));
        showToast(
          `ייבוא OFF: ${queued.toLocaleString("he-IL")} מוצרים לבדיקה (${skipped.toLocaleString("he-IL")} דולגו)`,
          "success",
        );
        return {
          scanned,
          skipped,
          queued,
          verifiedOverrides,
          completed: true,
          stoppedEarly: false,
          totalOffReported: summary.totalReportedCount,
        };
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          showToast("ייבוא OFF בוטל", "error");
          return {
            scanned,
            skipped,
            queued,
            verifiedOverrides,
            completed: false,
            stoppedEarly: false,
          };
        }
        const msg = e instanceof Error ? e.message : "שגיאה בייבוא OFF";
        showToast(msg, "error");
        return {
          scanned,
          skipped,
          queued,
          verifiedOverrides,
          completed: false,
          stoppedEarly: false,
        };
      }
    },
    [user, catalog, offPendingReviews, offImportCheckpoint, showToast],
  );

  const clearOffImportCheckpoint = useCallback(async () => {
    if (!user) return;
    await remove(ref(db, `users/${user.uid}/catalog/meta/offImportCheckpoint`));
  }, [user]);

  const purgeOffImportedFromCatalog = useCallback(async () => {
    if (!user) {
      showToast("צריך להתחבר", "error");
      return { removed: 0, kept: 0 };
    }
    const toRemove = catalog.filter(isOffImportedCatalogProduct);
    const kept = catalog.length - toRemove.length;
    if (toRemove.length === 0) {
      showToast("אין מוצרים לייבוא OFF למחיקה במאגר", "error");
      return { removed: 0, kept };
    }
    const base = `users/${user.uid}/catalog/products`;
    const chunkSize = 200;
    for (let i = 0; i < toRemove.length; i += chunkSize) {
      const chunk = toRemove.slice(i, i + chunkSize);
      const updates: Record<string, null> = {};
      for (const p of chunk) {
        const key = p.id.startsWith("internal:") ? p.id : normalizeBarcode(p.gtin ?? p.id);
        if (key.length >= 6) updates[`${base}/${key}`] = null;
      }
      if (Object.keys(updates).length > 0) await update(ref(db), updates);
    }
    showToast(
      `הוסרו ${toRemove.length.toLocaleString("he-IL")} מוצרי OFF מהמאגר. נשארו ${kept.toLocaleString("he-IL")} (ידני וכו׳).`,
      "success",
    );
    return { removed: toRemove.length, kept };
  }, [user, catalog, showToast]);

  const approveOffPendingReview = useCallback(
    async (item: OffPendingReview) => {
      if (!user) {
        showToast("צריך להתחבר", "error");
        return;
      }
      const gtin = normalizeBarcode(item.gtin ?? item.id);
      const per = item.nutrition?.per100g ?? {};
      await upsertByBarcode({
        barcode: gtin,
        name: item.name,
        shortName: item.shortName,
        brand: item.brand,
        keywords: item.keywords,
        category: item.category,
        usageTags: item.usageTags,
        per100Basis: item.per100Basis,
        defaultMeasure: item.defaultMeasure,
        commonMeasures: item.commonMeasures,
        per100: per,
        totalWeightG: item.package?.totalWeightG,
        unitsPerPack: item.package?.unitsPerPack,
        measures: item.measures,
        sourceType: item.sources?.some((s) => s.type === "verified100")
          ? "barcode_openfoodfacts"
          : "barcode_openfoodfacts",
      });
      await remove(ref(db, `users/${user.uid}/catalog/offPendingReview/${gtin}`));
      showToast("נוסף למאגר", "success");
    },
    [user, upsertByBarcode, showToast],
  );

  const rejectOffPendingReview = useCallback(
    async (id: string) => {
      if (!user) return;
      const key = normalizeBarcode(id);
      await remove(ref(db, `users/${user.uid}/catalog/offPendingReview/${key}`));
      showToast("הוסר מרשימת הבדיקה", "success");
    },
    [user, showToast],
  );

  const updateOffPendingReview = useCallback(
    async (item: OffPendingReview) => {
      if (!user) {
        showToast("צריך להתחבר", "error");
        return;
      }
      const key = normalizeBarcode(item.gtin ?? item.id);
      const now = new Date().toISOString();
      await set(
        ref(db, `users/${user.uid}/catalog/offPendingReview/${key}`),
        cleanForRtdb({ ...item, id: key, updatedAt: now }),
      );
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

  const createSupermarketTrip = useCallback(
    async (input: { name: string; category: string }) => {
      if (!user) {
        showToast("צריך להתחבר", "error");
        return null;
      }
      const name = input.name.trim();
      const category = input.category.trim();
      if (name.length < 1 || category.length < 1) {
        showToast("נא למלא שם וקטגוריה למעבר", "error");
        return null;
      }
      const now = new Date().toISOString();
      const newRef = push(ref(db, `users/${user.uid}/catalog/supermarketTrips`));
      const key = newRef.key;
      if (!key) {
        showToast("שגיאה ביצירת מעבר", "error");
        return null;
      }
      await set(newRef, cleanForRtdb({ name, category, createdAt: now, updatedAt: now }));
      return key;
    },
    [user, showToast],
  );

  const addSupermarketDraft = useCallback(
    async (payload: SupermarketDraftPayload) => {
      if (!user) {
        showToast("צריך להתחבר", "error");
        return null;
      }
      const now = new Date().toISOString();
      const draftsRoot = `users/${user.uid}/catalog/supermarketDrafts`;
      const newRef = push(ref(db, draftsRoot));
      const key = newRef.key;
      if (!key) {
        showToast("שגיאה בשמירת טיוטה", "error");
        return null;
      }
      const draftPath = `${draftsRoot}/${key}`;
      const tripTouchPath = `users/${user.uid}/catalog/supermarketTrips/${payload.tripId}/updatedAt`;
      await update(ref(db), {
        [draftPath]: cleanForRtdb({
          ...payload,
          createdAt: now,
          updatedAt: now,
        }),
        [tripTouchPath]: now,
      });
      showToast("נשמר — אפשר להמשיך למוצר הבא באותו מעבר", "success");
      return key;
    },
    [user, showToast],
  );

  const deleteSupermarketDraft = useCallback(
    async (id: string) => {
      if (!user) {
        showToast("צריך להתחבר", "error");
        return;
      }
      await remove(ref(db, `users/${user.uid}/catalog/supermarketDrafts/${id}`));
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
      importOpenFoodFactsIsrael,
      offImportCheckpoint,
      offImportCheckpointReady,
      clearOffImportCheckpoint,
      purgeOffImportedFromCatalog,
      offPendingReviews,
      offPendingReady,
      approveOffPendingReview,
      rejectOffPendingReview,
      updateOffPendingReview,
      deleteProduct,
      supermarketTrips,
      supermarketDrafts,
      supermarketTripsReady,
      supermarketDraftsReady,
      createSupermarketTrip,
      addSupermarketDraft,
      deleteSupermarketDraft,
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
      importOpenFoodFactsIsrael,
      offImportCheckpoint,
      offImportCheckpointReady,
      clearOffImportCheckpoint,
      purgeOffImportedFromCatalog,
      offPendingReviews,
      offPendingReady,
      approveOffPendingReview,
      rejectOffPendingReview,
      updateOffPendingReview,
      deleteProduct,
      supermarketTrips,
      supermarketDrafts,
      supermarketTripsReady,
      supermarketDraftsReady,
      createSupermarketTrip,
      addSupermarketDraft,
      deleteSupermarketDraft,
    ],
  );

  return <CatalogContext.Provider value={value}>{children}</CatalogContext.Provider>;
}

export function useCatalog() {
  const ctx = useContext(CatalogContext);
  if (!ctx) throw new Error("useCatalog must be used within CatalogProvider");
  return ctx;
}

