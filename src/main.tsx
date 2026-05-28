import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import App from "./App";
import "./index.css";

if (import.meta.env.PROD) {
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      // A newer build is available — apply it and reload so the user always
      // gets the latest version without manually clearing the PWA cache.
      void updateSW(true);
    },
    onRegisteredSW(_swUrl, registration) {
      if (!registration) return;
      // Long-lived PWA sessions rarely reload, so poll for updates so a new
      // deploy is picked up automatically within a minute.
      setInterval(() => {
        void registration.update();
      }, 60 * 1000);
    },
  });
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
