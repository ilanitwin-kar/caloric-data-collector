import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  onValue,
  push,
  ref,
  remove,
  set,
  type DataSnapshot,
} from "firebase/database";
import { db } from "../firebase";
import type { Product } from "../types/product";
import { useAuth } from "./AuthContext";
import { useToast } from "./ToastContext";

/** RTDB node for saved products (push ids + full Product payload). */
export const HISTORY_NODE = "history";

type ProductsContextValue = {
  products: Product[];
  /** True only until the first `onValue` snapshot is applied (initial sync). */
  loading: boolean;
  error: string | null;
  /** True after the first successful realtime snapshot (including empty). */
  hasLoaded: boolean;
  addProduct: (product: Omit<Product, "id" | "savedAt">) => Promise<void>;
  deleteProduct: (id: string) => Promise<void>;
  updateProduct: (product: Product) => Promise<void>;
  duplicateProduct: (product: Product) => Promise<void>;
};

const ProductsContext = createContext<ProductsContextValue | null>(null);

function logFirebaseError(context: string, e: unknown) {
  console.error(context, e);
  if (e instanceof Error) {
    console.error("name:", e.name, "message:", e.message, "stack:", e.stack);
  }
  if (e && typeof e === "object" && "code" in e) {
    console.error("Firebase error code:", String((e as { code: unknown }).code));
  }
  if (e && typeof e === "object" && "customData" in e) {
    console.error("customData:", (e as { customData?: unknown }).customData);
  }
}

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
  const { showToast } = useToast();
  const { user } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setProducts([]);
      setLoading(false);
      setHasLoaded(false);
      setError(null);
      return;
    }

    const r = ref(db, `users/${user.uid}/${HISTORY_NODE}`);
    let first = true;

    const unsub = onValue(
      r,
      (snap) => {
        const list = snapshotToProducts(snap);
        setProducts(list);
        setError(null);
        if (first) {
          first = false;
          setLoading(false);
          setHasLoaded(true);
        }
      },
      (err) => {
        logFirebaseError("onValue(history) listener error:", err);
        setError(err.message);
        setLoading(false);
        if (first) {
          first = false;
        }
      },
    );

    return () => unsub();
  }, [user]);

  const addProduct = useCallback(
    async (data: Omit<Product, "id" | "savedAt">) => {
      if (!user) {
        const err = new Error("Not authenticated");
        showToast("צריך להתחבר כדי לשמור", "error");
        throw err;
      }

      const listRef = ref(db, `users/${user.uid}/${HISTORY_NODE}`);
      const newRef = push(listRef);
      const pushKey = newRef.key;
      if (!pushKey) {
        const err = new Error("push() did not return a key");
        logFirebaseError("Firebase push() failed — full error:", err);
        showToast("שגיאה בשמירה לענן", "error");
        throw err;
      }

      const productData: Product = {
        ...data,
        id: pushKey,
        savedAt: new Date().toISOString(),
      };

      console.log("Saving to Firebase...", productData);

      try {
        await set(newRef, productData);
        console.log("Save successful!");
        showToast("המוצר נשמר בהצלחה", "success");
      } catch (e) {
        logFirebaseError("Firebase set() after push() failed — full error:", e);
        showToast("שגיאה בשמירה לענן", "error");
        throw e;
      }
    },
    [showToast],
  );

  const deleteProduct = useCallback(
    async (id: string) => {
      if (!user) {
        showToast("צריך להתחבר כדי למחוק", "error");
        return;
      }
      try {
        await remove(ref(db, `users/${user.uid}/${HISTORY_NODE}/${id}`));
        showToast("המוצר נמחק", "success");
      } catch (e) {
        logFirebaseError("Firebase remove() failed — full error:", e);
        showToast("שגיאה במחיקה", "error");
        throw e;
      }
    },
    [showToast],
  );

  const updateProduct = useCallback(
    async (product: Product) => {
      if (!user) {
        showToast("צריך להתחבר כדי לעדכן", "error");
        return;
      }
      try {
        await set(ref(db, `users/${user.uid}/${HISTORY_NODE}/${product.id}`), product);
        showToast("המוצר עודכן", "success");
      } catch (e) {
        logFirebaseError("Firebase set(update) failed — full error:", e);
        showToast("שגיאה בעדכון", "error");
        throw e;
      }
    },
    [showToast],
  );

  const duplicateProduct = useCallback(
    async (product: Product) => {
      if (!user) {
        showToast("צריך להתחבר כדי לשכפל", "error");
        return;
      }
      const listRef = ref(db, `users/${user.uid}/${HISTORY_NODE}`);
      const newRef = push(listRef);
      const key = newRef.key;
      if (!key) {
        showToast("שגיאה בשכפול", "error");
        return;
      }
      const copy: Product = {
        ...product,
        id: key,
        savedAt: new Date().toISOString(),
      };
      try {
        await set(newRef, copy);
        showToast("המוצר שוכפל", "success");
      } catch (e) {
        logFirebaseError("Firebase duplicate set() failed — full error:", e);
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
