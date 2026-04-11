import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { BottomNav } from "./components/BottomNav";
import { ProductsProvider } from "./context/ProductsContext";
import { ToastProvider } from "./context/ToastContext";
import { History } from "./pages/History";
import { Home } from "./pages/Home";
import { Settings } from "./pages/Settings";

function Shell() {
  return (
    <div className="min-h-[100dvh] bg-black">
      <div className="mx-auto min-h-[100dvh] max-w-lg px-4 pb-28 pt-[max(1.25rem,env(safe-area-inset-top))]">
        <Outlet />
      </div>
      <BottomNav />
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <ProductsProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Shell />}>
              <Route index element={<Home />} />
              <Route path="history" element={<History />} />
              <Route path="settings" element={<Settings />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ProductsProvider>
    </ToastProvider>
  );
}
