import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { onValue, ref, set } from "firebase/database";
import { db } from "../lib/firebase";
import type { Product } from "../types/product";

type ProductsContextValue = {
  products: Product[];
  loading: boolean;
  error: string | null;
  addProduct: (product: Omit<Product, "id" | "savedAt">) => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const r = ref(db, "products");
    const unsub = onValue(
      r,
      (snap) => {
        setError(null);
        setLoading(false);
        const v = snap.val() as Record<string, Product> | null;
        if (!v) {
          setProducts([]);
          return;
        }
        const list = Object.values(v).sort(
          (a, b) =>
            new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime(),
        );
        setProducts(list);
      },
      (err) => {
        setLoading(false);
        setError(err.message);
      },
    );
    return () => unsub();
  }, []);

  const addProduct = useCallback(
    (data: Omit<Product, "id" | "savedAt">) => {
      const id = crypto.randomUUID();
      const entry: Product = {
        ...data,
        id,
        savedAt: new Date().toISOString(),
      };
      void set(ref(db, `products/${id}`), entry);
    },
    [],
  );

  const value = useMemo(
    () => ({ products, loading, error, addProduct }),
    [products, loading, error, addProduct],
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
