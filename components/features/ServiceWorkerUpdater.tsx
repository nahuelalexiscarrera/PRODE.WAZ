"use client";

import { useEffect } from "react";

/**
 * Auto-actualiza la PWA. Con skipWaiting + clientsClaim el service worker
 * nuevo toma control tras un deploy, pero la pantalla ya renderizada sigue
 * mostrando el bundle viejo hasta un reload manual. Acá recargamos al detectar
 * el cambio de controller, así cada socio recibe la versión fresca al instante.
 */
export function ServiceWorkerUpdater() {
  useEffect(() => {
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let refreshing = false;
    // Si NO había controller al cargar, este primer controllerchange es la
    // instalación inicial (clientsClaim) → no recargamos. Solo recargamos
    // cuando un SW nuevo reemplaza a uno que ya estaba controlando (= update).
    const hadController = navigator.serviceWorker.controller != null;

    const onControllerChange = () => {
      if (refreshing || !hadController) return;
      refreshing = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    // Buscar activamente un SW nuevo al abrir la app (no esperar a la próxima nav).
    navigator.serviceWorker.ready.then((reg) => reg.update()).catch(() => {});

    return () =>
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
  }, []);

  return null;
}
