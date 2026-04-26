import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onValue, ref, remove, set, type DataSnapshot } from "firebase/database";
import type { Product } from "../types/product";
import { db } from "../firebase";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

const STORAGE_KEY = "caloric-intelligence.products.v1";

type ProductsContextValue = {
  products: Product[];
  /** Loading can be local or cloud depending on auth. */
  loading: boolean;
  error: string | null;
  /** True after first local load (including empty). */
  hasLoaded: boolean;
  addProduct: (product: Omit<Product, "id" | "savedAt">) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  duplicateProduct: (product: Product) => Promise<void>;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

type ProductRecord = Record<string, Product>;

function safeParseProducts(raw: string | null): Product[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out = v.filter(
      (row): row is Product =>
        row != null &&
        typeof row === "object" &&
        typeof (row as Product).id === "string" &&
        typeof (row as Product).savedAt === "string",
    );
    out.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    return out;
  } catch {
    return [];
  }
}

function persistProducts(products: Product[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
  } catch {
    // If storage quota is exceeded or blocked, we keep working in-memory and show errors via context.
  }
}

function cleanForRtdb<T>(value: T): T {
  // RTDB rejects `undefined` anywhere in the payload.
  return JSON.parse(JSON.stringify(value)) as T;
}

function toRecord(list: Product[]): ProductRecord {
  const rec: ProductRecord = {};
  for (const p of list) rec[p.id] = p;
  return rec;
}

function toSortedList(rec: ProductRecord | null): Product[] {
  const list = rec ? Object.values(rec) : [];
  list.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
  return list;
}

function mergeByIdPreferLatest(a: ProductRecord, b: ProductRecord): ProductRecord {
  // Merge two maps by id; prefer the row with the newest savedAt.
  const out: ProductRecord = { ...a };
  for (const [id, next] of Object.entries(b)) {
    const prev = out[id];
    if (!prev) {
      out[id] = next;
      continue;
    }
    const tPrev = new Date(prev.savedAt).getTime();
    const tNext = new Date(next.savedAt).getTime();
    out[id] = tNext >= tPrev ? next : prev;
  }
  return out;
}

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    // When logged out → local-only mode.
    // When logged in → cloud mode (with local fallback + one-time merge).
    let unsub: (() => void) | null = null;
    let cancelled = false;

    const localList = safeParseProducts(localStorage.getItem(STORAGE_KEY));

    if (!user) {
      setLoading(true);
      setProducts(localList);
      setError(null);
      setLoading(false);
      setHasLoaded(true);
      return () => {};
    }

    setLoading(true);
    setError(null);
    const r = ref(db, `users/${user.uid}/products/items`);
    let didInitialMerge = false;

    unsub = onValue(
      r,
      (snap: DataSnapshot) => {
        if (cancelled) return;
        const cloud = (snap.val() as ProductRecord | null) ?? null;
        const cloudList = toSortedList(cloud);

        // First time after login: merge local + cloud so user doesn't "lose" either side.
        if (!didInitialMerge) {
          didInitialMerge = true;
          const merged = mergeByIdPreferLatest(toRecord(cloudList), toRecord(localList));
          const mergedList = toSortedList(merged);
          setProducts(mergedList);
          setError(null);
          setLoading(false);
          setHasLoaded(true);
          // Push merged result back to cloud (best-effort).
          void set(r, cleanForRtdb(merged)).catch((e: unknown) => {
            if (cancelled) return;
            const msg = e instanceof Error ? e.message : "שגיאה בסנכרון לענן";
            setError(msg);
          });
          return;
        }

        setProducts(cloudList);
        setError(null);
        setLoading(false);
        setHasLoaded(true);
      },
      (err) => {
        if (cancelled) return;
        setError(err.message);
        // Cloud failed — keep local state visible so the app stays usable.
        setProducts(localList);
        setLoading(false);
        setHasLoaded(true);
      },
    );

    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [user]);

  // Persist whenever products change (after initial load).
  useEffect(() => {
    if (!hasLoaded) return;
    persistProducts(products);
  }, [products, hasLoaded]);

  const addProduct = useCallback(
    async (data: Omit<Product, "id" | "savedAt">) => {
      const uid = user?.uid ?? null;
      const productData: Product = {
        ...data,
        id: newId(),
        savedAt: new Date().toISOString(),
      };
      setProducts((prev) => [productData, ...prev]);
      if (!uid) {
        showToast("המוצר נשמר מקומית", "success");
        return;
      }
      try {
        const r = ref(db, `users/${uid}/products/items/${productData.id}`);
        await set(r, cleanForRtdb(productData));
        showToast("המוצר נשמר בענן", "success");
      } catch (e) {
        const msg = e instanceof Error ? e.message : "שגיאה בשמירה לענן";
        setError(msg);
        showToast("שמירה לענן נכשלה — נשמר מקומית", "error");
      }
    },
    [showToast, user],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      try {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        if (user?.uid) {
          const r = ref(db, `users/${user.uid}/products/items/${id}`);
          await remove(r);
        }
        showToast("המוצר נמחק", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
        showToast("שגיאה במחיקה", "error");
        throw e;
      }
    },
    [showToast, user],
  );

  const updateProduct = useCallback(
    async (product: Product) => {
      try {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
        if (user?.uid) {
          const r = ref(db, `users/${user.uid}/products/items/${product.id}`);
          await set(r, cleanForRtdb(product));
        }
        showToast("המוצר עודכן", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון");
        showToast("שגיאה בעדכון", "error");
        throw e;
      }
    },
    [showToast, user],
  );

  const duplicateProduct = useCallback(
    async (product: Product) => {
      const uid = user?.uid ?? null;
      const copy: Product = {
        ...product,
        id: newId(),
        savedAt: new Date().toISOString(),
      };
      try {
        setProducts((prev) => [copy, ...prev]);
        if (uid) {
          const r = ref(db, `users/${uid}/products/items/${copy.id}`);
          await set(r, cleanForRtdb(copy));
        }
        showToast("המוצר שוכפל", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשכפול");
        showToast("שגיאה בשכפול", "error");
        throw e;
      }
    },
    [showToast, user],
  );

  const value = useMemo(
    () => ({
      products,
      loading,
      error,
      hasLoaded,
      addProduct,
      deleteProduct,
      updateProduct,
      duplicateProduct,
    }),
    [
      products,
      loading,
      error,
      hasLoaded,
      addProduct,
      deleteProduct,
      updateProduct,
      duplicateProduct,
    ],
  );

  return (
    <ProductsContext.Provider value={value}>{children}</ProductsContext.Provider>
  );
}

export function useProducts() {
  const ctx = useContext(ProductsContext);
  if (!ctx) throw new Error("useProducts must be used within ProductsProvider");
  return ctx;
}
