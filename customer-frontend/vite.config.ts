import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    server: {
      host: "0.0.0.0",
      port: 3000,
      proxy: {
        "/api": {
          target: "http://localhost:5001",
          changeOrigin: true,
        },
        "/admin": {
          target: "http://localhost:3001",
          changeOrigin: true,
          ws: true,
        },
      },
    },
    plugins: [
      VitePWA({
        registerType: "autoUpdate",
        manifest: {
          name: "Cafe Loyalty",
          short_name: "Cafe",
          theme_color: "#000000",
          background_color: "#000000",
          display: "standalone",
          icons: [
            {
              src: "/pwa-192x192.png",
              sizes: "192x192",
              type: "image/png",
            },
            {
              src: "/pwa-512x512.png",
              sizes: "512x512",
              type: "image/png",
            },
          ],
        },
      }),
    ],
  },
});
