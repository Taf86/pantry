import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Pantry",
        short_name: "Pantry",
        description: "Liste della spesa e dispense condivise",
        lang: "it",
        start_url: "/",
        display: "standalone",
        background_color: "#f7f7f5",
        theme_color: "#2f6f4f",
        icons: [
          {
            src: "/favicon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        // Precache dell'app shell: al supermercato l'app deve aprirsi anche
        // senza rete, prima ancora di leggere i dati dalla cache di query.
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          {
            // Le risposte di sessione non si mettono mai in cache: servirne
            // una stantia significa mostrare l'app a chi è stato sospeso.
            urlPattern: /^\/api\/auth\//,
            handler: "NetworkOnly",
          },
          {
            urlPattern: /^\/api\//,
            handler: "NetworkFirst",
            options: {
              cacheName: "pantry-api",
              networkTimeoutSeconds: 5,
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  server: {
    /**
     * In sviluppo Vite fa da proxy verso l'API, così il browser vede una sola
     * origin esattamente come in produzione dietro Caddy. Senza, il cookie di
     * sessione non partirebbe e l'intero modello di autenticazione andrebbe
     * provato solo in produzione — che è il modo peggiore di provarlo.
     */
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/socket.io": { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
  },
});
