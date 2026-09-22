import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { API_CACHE_NAME } from "./src/lib/pwa.js";

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.svg", "apple-touch-icon-180x180.png"],
      manifest: {
        name: "Pantry",
        short_name: "Pantry",
        description: "Shared shopping lists and pantries",
        lang: "it",
        start_url: "/",
        display: "standalone",
        // Uguali a --background: la barra di sistema deve sparire nella pagina.
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
          // Android ignora le icone SVG: senza PNG l'installazione mostra un
          // segnaposto vuoto. `maskable` va tenuta separata da `any` perché ha
          // il margine di sicurezza e verrebbe ritagliata male come icona piena.
          {
            src: "/pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/maskable-icon-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        globPatterns: ["**/*.{js,css,html,svg,png,woff2}"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
        runtimeCaching: [
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/api/auth/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: ({ url, sameOrigin }) =>
              sameOrigin && url.pathname.startsWith("/api/"),
            handler: "NetworkFirst",
            options: {
              cacheName: API_CACHE_NAME,
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
    sourcemap: "hidden",
  },
});
