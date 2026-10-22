import { useEffect, useState, useSyncExternalStore } from "react";

/** Registra o service worker (só na versão publicada) e recarrega quando sai uma versão nova. */
export function setupPwa() {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    const hadController = Boolean(navigator.serviceWorker.controller);
    navigator.serviceWorker.register("/sw.js", { updateViaCache: "none" }).then(registration => {
      // Procura versão nova ao voltar para o app (o celular deixa o app aberto por dias).
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "visible") void registration.update().catch(() => undefined);
      });
    }).catch(() => undefined);
    let reloaded = false;
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      // Versão nova assumiu: recarrega uma vez, sem perder nada (formulários abertos ficam para trás só se estiverem sendo preenchidos).
      if (!hadController || reloaded || document.querySelector("[role=dialog]")) return;
      reloaded = true;
      window.location.reload();
    });
  });
}

export function clearOfflineData() {
  navigator.serviceWorker?.controller?.postMessage("logout");
}

// ------------------------------------------------------------------ internet

function subscribeOnline(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}
export const useOnline = () => useSyncExternalStore(subscribeOnline, () => navigator.onLine, () => true);

// ------------------------------------------------------------------ instalação

type InstallPromptEvent = Event & { prompt(): Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
let deferredPrompt: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(l => l());

window.addEventListener("beforeinstallprompt", event => {
  event.preventDefault();
  deferredPrompt = event as InstallPromptEvent;
  notify();
});
window.addEventListener("appinstalled", () => {
  deferredPrompt = null;
  notify();
});

export const isStandalone = () =>
  window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);

/**
 * Estado da instalação: "pronto" (Android/Chrome: botão instala direto), "ios" (precisa do menu Compartilhar),
 * "instalado" ou "indisponivel".
 */
export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const listener = () => force(n => n + 1);
    listeners.add(listener);
    return () => { listeners.delete(listener); };
  }, []);
  const state = isStandalone() ? "instalado" : deferredPrompt ? "pronto" : isIos() ? "ios" : "indisponivel";
  async function install() {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    deferredPrompt = null;
    notify();
    return outcome === "accepted";
  }
  return { state, install } as const;
}
