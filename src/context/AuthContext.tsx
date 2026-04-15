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
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);

  useEffect(() => {
    // Handle redirect-based sign-in (fallback for blocked/closed popups).
    void getRedirectResult(auth).catch((e) => {
      console.warn("getRedirectResult error:", e);
    });

    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return () => unsub();
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      loading,
      signIn: async () => {
        const provider = new GoogleAuthProvider();
        // Mobile/PWA browsers are more reliable with redirect auth.
        if (isMobile) {
          await signInWithRedirect(auth, provider);
          return;
        }
        try {
          await signInWithPopup(auth, provider);
        } catch (e) {
          // Common when popups are blocked or immediately closed by the browser.
          console.warn("signInWithPopup failed; falling back to redirect:", e);
          await signInWithRedirect(auth, provider);
        }
      },
      signOut: async () => {
        await signOut(auth);
      },
    }),
    [user, loading, isMobile],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

