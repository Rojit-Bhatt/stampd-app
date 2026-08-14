import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App.tsx';
import './index.css';

// Registering here, rather than letting the plugin emit its own
// registerSW.js, is what makes `registerType: "autoUpdate"` real. The emitted
// script is a bare one-shot `navigator.serviceWorker.register(...)` with no
// update polling; this one re-checks for a new worker while the app is open,
// so a deploy reaches a phone that keeps the PWA in the background instead of
// waiting for every tab to close.
//
// sw.ts calls skipWaiting()/clients.claim(), so a new worker takes over a LIVE
// page. That swaps the precache under a running bundle: the page's next lazy
// route chunk would 404 against a manifest that no longer lists it. Reloading
// on controllerchange is the other half of that trade.
//
// `hadController` guards the first-ever visit: clients.claim() fires
// controllerchange on initial install too, and reloading there would be a
// pointless flash on a page that is already running the newest code.
const hadController = Boolean(navigator.serviceWorker?.controller);
let reloading = false;
navigator.serviceWorker?.addEventListener('controllerchange', () => {
  if (!hadController || reloading) return;
  reloading = true;
  window.location.reload();
});

registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
