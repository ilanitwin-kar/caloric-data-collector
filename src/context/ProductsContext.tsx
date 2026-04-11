import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { get, ref, set, type DataSnapshot } from "firebase/database";
import { db } from "../lib/firebase";
import type { Product } from "../types/product";

type ProductsContextValue = {
  products: Product[];
  /** True only while a manual `loadProducts` request is in flight. */
  loading: boolean;
  error: string | null;
  /** True after at least one successful fetch from Firebase (including empty). */
  hasLoaded: boolean;
  loadProducts: () => Promise<void>;
  addProduct: (product: Omit<Product, "id" | "savedAt">) => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

function snapshotToProducts(snap: DataSnapshot): Product[] {
  const v = snap.val() as Record<string, Product> | null;
  if (!v || typeof v !== "object") return [];
  return Object.values(v)
    .filter(
      (row): row is Product =>
        row != null &&
        typeof row === "object" &&
        typeof row.savedAt === "string" &&
        typeof row.id === "string",
    )
    .sort(
      (a, b) =>
        new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
    );
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = ref(db, "products");
      const snap = await get(r);
      setProducts(snapshotToProducts(snap));
      setHasLoaded(true);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "שגיאה בטעינת הנתונים";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, []);

  const addProduct = useCallback(
    (data: Omit<Product, "id" | "savedAt">) => {
      const id = crypto.randomUUID();
      const entry: Product = {
        ...data,
        id,
        savedAt: new Date().toISOString(),
      };
      void set(ref(db, `products/${id}`), entry).catch((e: Error) => {
        console.error("Firebase write failed:", e);
      });
    },
    [],
  );

  const value = useMemo(
    () => ({
      products,
      loading,
      error,
      hasLoaded,
      loadProducts,
      addProduct,
    }),
    [products, loading, error, hasLoaded, loadProducts, addProduct],
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
