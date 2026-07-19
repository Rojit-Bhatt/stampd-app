import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "autoUpdate",
      // apple-touch-icon isn't in the manifest (iOS reads it from a <link> in
      // index.html instead) — list it here so the service worker still
      // precaches it.
      includeAssets: ["apple-touch-icon.png"],
      manifest: {
        name: "Stampd",
        short_name: "Stampd",
        description: "Your points at every place you visit — scan, earn, redeem.",
        // Dark ink status bar (always readable) over the app's off-white
        // splash. The one installed "Stampd" app opens to /explore — the
        // customer's list of every place they've joined — not any single
        // outlet (outlet slugs aren't unique platform-wide, so there is no
        // one outlet a global install could point at).
        theme_color: "#14201C",
        background_color: "#F7F8F7",
        display: "standalone",
        start_url: "/explore",
        scope: "/",
        icons: [
          { src: "/pwa-192x192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/pwa-512x512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/pwa-maskable-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    host: '0.0.0.0',
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modify—file watching is disabled to prevent flickering during agent edits.
    hmr: process.env.DISABLE_HMR !== 'true',
    // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
    watch: process.env.DISABLE_HMR === 'true' ? null : {},
  },
});
