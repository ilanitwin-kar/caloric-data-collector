import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  GoogleAuthProvider,
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { auth } from "../firebase";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  authError: string | null;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

function getAuthErrorMessage(error: unknown): string {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("auth/unauthorized-domain")) {
    return "הדומיין לא מאושר ב-Firebase. Authentication → Settings → Authorized domains — הוסיפי את כתובת האתר המדויקת (למשל xxx.netlify.app).";
  }
  if (code.includes("auth/web-storage-unsupported")) {
    return "הדפדפן חוסם אחסון — נסי מצב פרטי אחר, או דפדפן אחר.";
  }
  if (code.includes("auth/popup-closed-by-user")) {
    return "חלון ההתחברות נסגר לפני סיום. אפשר לנסות שוב.";
  }
  if (code.includes("auth/popup-blocked")) {
    return "הדפדפן חסם חלון התחברות. אפשר לאפשר חלונות קופצים או לנסות שוב.";
  }
  if (code.includes("auth/cancelled-popup-request")) {
    return "בקשת התחברות קודמת בוטלה. אפשר לנסות שוב.";
  }
  return "ההתחברות נכשלה כרגע. נסי שוב בעוד רגע.";
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const isIos = /iPhone|iPad|iPod/i.test(navigator.userAgent);
  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
    // iOS Safari PWA
    ("standalone" in navigator && Boolean((navigator as unknown as { standalone?: boolean }).standalone));

  useEffect(() => {
    let cancelled = false;

    const unsub = onAuthStateChanged(auth, (u) => {
      if (cancelled) return;
      setUser(u);
      if (u) setAuthError(null);
      setLoading(false);
    });

    void (async () => {
      try {
        await getRedirectResult(auth);
      } catch (e) {
        console.warn("getRedirectResult:", e);
        if (!cancelled) setAuthError(getAuthErrorMessage(e));
      }
    })();

    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      authError,
      signIn: async () => {
        const provider = new GoogleAuthProvider();
        setAuthError(null);
        // iOS and installed PWAs are often more reliable with redirect auth.
        if (isIos || isStandalone) {
          await signInWithRedirect(auth, provider).catch((e) => {
            setAuthError(getAuthErrorMessage(e));
            throw e;
          });
          return;
        }
        try {
          await signInWithPopup(auth, provider);
        } catch (e) {
          // Common when popups are blocked or immediately closed by the browser.
          console.warn("signInWithPopup failed; falling back to redirect:", e);
          await signInWithRedirect(auth, provider).catch((redirectError) => {
            setAuthError(getAuthErrorMessage(redirectError));
            throw redirectError;
          });
        }
      },
      signOut: async () => {
        await signOut(auth);
      },
    }),
    [user, loading, authError, isIos, isStandalone],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

