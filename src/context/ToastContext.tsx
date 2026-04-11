import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

const TOAST_MS = 3000;

type ToastVariant = "success" | "error";

type ToastPayload = { id: number; message: string; variant: ToastVariant };

type ToastContextValue = {
  showToast: (message: string, variant?: ToastVariant) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastPayload | null>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const idRef = useRef(0);

  const showToast = useCallback((message: string, variant: ToastVariant = "success") => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    idRef.current += 1;
    setToast({ id: idRef.current, message, variant });
    hideTimer.current = setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(
    () => () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    },
    [],
  );

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {toast ? (
        <div
          className="pointer-events-none fixed inset-x-0 z-[60] flex justify-center px-4"
          style={{
            bottom: "max(6.75rem, calc(5.25rem + env(safe-area-inset-bottom)))",
          }}
        >
          <div
            key={toast.id}
            role="status"
            aria-live="polite"
            className="animate-toast-in pointer-events-auto w-full max-w-lg rounded-2xl border border-white/[0.12] bg-black px-5 py-3.5 text-center font-medium leading-snug tracking-wide text-white shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
          >
            {toast.message}
          </div>
        </div>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
