import path from "node:path";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";
import { REALTIME_PATH } from "@pantry/shared";
import { API_CACHE_NAME } from "./src/lib/pwa.js";

const API_TARGET = process.env["VITE_API_TARGET"] ?? "http://localhost:3000";

/**
 * Built from the shared constant so the service worker, the dev proxy and the
 * server cannot drift apart. The denylist sees only the path, not the full
 * href, which is why this is anchored and not a substring match.
 */
const REALTIME_ROUTE = new RegExp(`^${REALTIME_PATH}(/|$)`);

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
        theme_color: "#ffffff",
        background_color: "#ffffff",
        icons: [
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
            src: "/maskable-icon-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
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
        importScripts: ["/push-sw.js"],
        globIgnores: ["push-sw.js"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api/, REALTIME_ROUTE],
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
      [REALTIME_PATH]: { target: API_TARGET, ws: true, changeOrigin: false },
    },
  },
  build: {
    sourcemap: "hidden",
  },
});
