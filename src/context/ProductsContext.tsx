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

const STORAGE_KEY = "caloric-intelligence-products-v1";

function loadProducts(): Product[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed as Product[];
  } catch {
    return [];
  }
}

function persist(products: Product[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(products));
}

type ProductsContextValue = {
  products: Product[];
  addProduct: (product: Omit<Product, "id" | "savedAt">) => void;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

export function ProductsProvider({ children }: { children: ReactNode }) {
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    setProducts(loadProducts());
  }, []);

  const addProduct = useCallback(
    (data: Omit<Product, "id" | "savedAt">) => {
      const entry: Product = {
        ...data,
        id: crypto.randomUUID(),
        savedAt: new Date().toISOString(),
      };
      setProducts((prev) => {
        const next = [entry, ...prev];
        persist(next);
        return next;
      });
    },
    [],
  );

  const value = useMemo(
    () => ({ products, addProduct }),
    [products, addProduct],
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
