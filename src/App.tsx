import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { AuthProvider, useAuth } from "./context/AuthContext";
import { CatalogProvider } from "./context/CatalogContext";
import { ToastProvider } from "./context/ToastContext";
import { Verified100Provider } from "./context/Verified100Context";
import { Catalog } from "./pages/Catalog";
import { Home } from "./pages/Home";
import { PendingEdits } from "./pages/PendingEdits";
import { PendingOffReview } from "./pages/PendingOffReview";
import { CatalogGaps } from "./pages/CatalogGaps";
import { Settings } from "./pages/Settings";
import { SupermarketNewTrip } from "./pages/SupermarketNewTrip";
import { SupermarketQuickFill } from "./pages/SupermarketQuickFill";
import { BarcodeMatch } from "./pages/BarcodeMatch";

function Shell() {
  const { user, loading, authError, signIn, signOut } = useAuth();
  return (
    <div className="min-h-[100dvh] bg-black">
      <div className="mx-auto min-h-[100dvh] max-w-lg px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div className="min-w-0">
            {loading ? (
              <p className="text-sm text-ink-dim">מתחבר…</p>
            ) : user ? (
              <p className="truncate text-sm text-ink-dim">
                מחובר/ת: {user.email ?? "ללא אימייל"}
              </p>
            ) : (
              <p className="text-sm text-ink-dim">לא מחובר/ת</p>
            )}
          </div>
          {!loading && !user ? (
            <button
              type="button"
              onClick={() => void signIn()}
              className="rounded-xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-semibold text-white transition hover:bg-white/[0.09]"
            >
              התחברות
            </button>
          ) : null}
          {!loading && user ? (
            <button
              type="button"
              onClick={() => void signOut()}
              className="rounded-xl border border-white/10 bg-transparent px-3 py-2 text-sm font-semibold text-ink-muted transition hover:border-white/25 hover:text-white"
            >
              יציאה
            </button>
          ) : null}
        </div>
        {authError && !user ? (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-3 py-2">
            <p className="text-sm text-red-200">{authError}</p>
          </div>
        ) : null}

        <Outlet />
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
            <BrowserRouter basename={import.meta.env.BASE_URL}>
              <Routes>
                <Route element={<Shell />}>
                  <Route index element={<Home />} />
                  <Route path="supermarket" element={<SupermarketNewTrip />} />
                  <Route path="supermarket/:tripId" element={<SupermarketQuickFill />} />
                  <Route path="pending-edits" element={<PendingEdits />} />
                  <Route path="off-review" element={<PendingOffReview />} />
                  <Route path="catalog" element={<Catalog />} />
                  <Route path="settings" element={<Settings />} />
                  <Route path="catalog-gaps" element={<CatalogGaps />} />
                  <Route path="barcode-match" element={<BarcodeMatch />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Route>
              </Routes>
            </BrowserRouter>
          </CatalogProvider>
        </Verified100Provider>
      </ToastProvider>
    </AuthProvider>
  );
}
