/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute } from "workbox-precaching";

declare let self: ServiceWorkerGlobalScope;

// `strategies: "injectManifest"` means vite-plugin-pwa injects the precache
// manifest and NOTHING else — no lifecycle code. Without the three calls
// below, `registerType: "autoUpdate"` in vite.config.ts is inert: a new
// worker installs after every deploy and then sits in `waiting` forever,
// because a worker only takes over once EVERY tab in scope has closed — which
// on an installed PWA is approximately never. Meanwhile precacheAndRoute
// keeps answering navigations from the OLD precached index.html, which points
// at the OLD bundle. The result is a device that can never receive a deploy
// no matter how many times it is reloaded. See
// docs/bug/2026-08-14-stale-sw-and-csp-report-storm.md.
//
// skipWaiting() is written out rather than imported from workbox-core so this
// file adds no dependency the frontend package.json doesn't already declare
// (workbox-precaching is a direct dep; workbox-core is only transitive, which
// a strict pnpm install would refuse to resolve).
self.addEventListener("install", () => {
  self.skipWaiting();
});

// clientsClaim(): take over already-open pages instead of waiting for the
// next navigation. The page reloads itself when this fires — see the
// controllerchange handler in main.tsx — which is what keeps a live tab from
// running old application code against a precache that has just been swapped
// underneath it.
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Drops precaches left behind by older Workbox revisions, so a phone that has
// been through several deploys isn't storing every past build.
cleanupOutdatedCaches();

precacheAndRoute(self.__WB_MANIFEST);

self.addEventListener("push", (event) => {
  const data = event.data?.json() ?? {};
  event.waitUntil(
    self.registration.showNotification(data.title ?? "Stampd", { body: data.body ?? "" })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(self.clients.openWindow("/"));
});
