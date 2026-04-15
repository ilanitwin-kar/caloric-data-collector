import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === "true";

export default defineConfig({
  // Netlify/custom domains use "/" while GitHub Pages needs "/<repo>/".
  base: isGitHubPagesBuild ? "/caloric-data-collector/" : "/",
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["icon.svg"],
      manifest: {
        name: "אינטליגנציה קלורית",
        short_name: "אינטליגנציה קלורית",
        description:
          "איסוף נתוני תזונה ליחידת אריזה — מותאם לשימוש בסופרמרקט.",
        theme_color: "#000000",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait-primary",
        // Use relative URLs so PWA works under subpaths (GitHub Pages).
        start_url: ".",
        scope: ".",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,ico,svg,woff2}"],
      },
    }),
  ],
});
