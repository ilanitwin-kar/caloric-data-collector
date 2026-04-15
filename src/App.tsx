import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider } from "./context/CatalogContext";
import { ProductsProvider } from "./context/ProductsContext";
import { ToastProvider } from "./context/ToastContext";
import { Verified100Provider } from "./context/Verified100Context";
import { Catalog } from "./pages/Catalog";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";

function Shell() {
  const { user, loading, signIn, signOut } = useAuth();
  return (
    <div className="min-h-[100dvh] bg-black">
      <div className="mx-auto min-h-[100dvh] max-w-lg px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {loading ? (
              <p className="text-xs text-ink-dim">מתחבר…</p>
            ) : user ? (
              <p className="truncate text-xs text-ink-dim">
                מחובר/ת: {user.email ?? "ללא אימייל"}
              </p>
            ) : (
              <p className="text-xs text-ink-dim">לא מחובר/ת</p>
            )}
          </div>
          {!loading && !user ? (
            <button
              type="button"
              onClick={() => void signIn()}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-xs font-semibold text-white transition hover:bg-white/[0.09]"
            >
              התחברות
            </button>
          ) : null}
          {!loading && user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-white/10 bg-transparent px-3 py-2 text-xs font-semibold text-ink-muted transition hover:border-white/25 hover:text-white"
            >
              יציאה
            </button>
          ) : null}
        </div>

        {user ? (
          <Outlet />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-6 text-center">
            <p className="text-sm text-ink-muted">
              כדי לשמור מאגר פרטי בענן, צריך להתחבר עם Google.
            </p>
          </div>
        )}
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Verified100Provider>
          <CatalogProvider>
            <ProductsProvider>
              <BrowserRouter basename={import.meta.env.BASE_URL}>
                <Routes>
                  <Route element={<Shell />}>
                    <Route index element={<Home />} />
                    <Route path="catalog" element={<Catalog />} />
                    <Route path="history" element={<History />} />
                    <Route path="settings" element={<Settings />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Route>
                </Routes>
              </BrowserRouter>
            </ProductsProvider>
          </CatalogProvider>
        </Verified100Provider>
      </ToastProvider>
    </AuthProvider>
  );
}
