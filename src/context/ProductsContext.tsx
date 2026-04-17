import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { Product } from "../types/product";
import { useToast } from "./ToastContext";

const STORAGE_KEY = "caloric-intelligence.products.v1";

type ProductsContextValue = {
  products: Product[];
  /** Local read only (kept for UI parity). */
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

function newId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return (crypto as Crypto).randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function ProductsProvider({ children }: { children: ReactNode }) {
  const { showToast } = useToast();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    setLoading(true);
    const list = safeParseProducts(localStorage.getItem(STORAGE_KEY));
    setProducts(list);
    setError(null);
    setLoading(false);
    setHasLoaded(true);
  }, []);

  // Persist whenever products change (after initial load).
  useEffect(() => {
    if (!hasLoaded) return;
    persistProducts(products);
  }, [products, hasLoaded]);

  const addProduct = useCallback(
    async (data: Omit<Product, "id" | "savedAt">) => {
      const productData: Product = {
        ...data,
        id: newId(),
        savedAt: new Date().toISOString(),
      };
      setProducts((prev) => [productData, ...prev]);
      showToast("המוצר נשמר מקומית", "success");
    },
    [showToast],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      try {
        setProducts((prev) => prev.filter((p) => p.id !== id));
        showToast("המוצר נמחק", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה במחיקה");
        showToast("שגיאה במחיקה", "error");
        throw e;
      }
    },
    [showToast],
  );

  const updateProduct = useCallback(
    async (product: Product) => {
      try {
        setProducts((prev) => prev.map((p) => (p.id === product.id ? product : p)));
        showToast("המוצר עודכן", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בעדכון");
        showToast("שגיאה בעדכון", "error");
        throw e;
      }
    },
    [showToast],
  );

  const duplicateProduct = useCallback(
    async (product: Product) => {
      const copy: Product = {
        ...product,
        id: newId(),
        savedAt: new Date().toISOString(),
      };
      try {
        setProducts((prev) => [copy, ...prev]);
        showToast("המוצר שוכפל", "success");
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשכפול");
        showToast("שגיאה בשכפול", "error");
        throw e;
      }
    },
    [showToast],
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
