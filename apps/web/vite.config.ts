import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg"],
      manifest: {
        name: "Pantry",
        short_name: "Pantry",
        description: "Shared shopping lists and pantries",
        lang: "it",
        start_url: "/",
        display: "standalone",
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
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  server: {
    proxy: {
      "/api": { target: API_TARGET, changeOrigin: false },
      "/socket.io": { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: true,
  },
});
