"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Mientras haya partidos en vivo, re-renderiza el Home cada `intervalMs` para
 * traer el marcador fresco desde la DB (que el sync de cada 5 min actualiza).
 * Sin endpoint ni cron extra: solo un router.refresh() liviano que re-corre el
 * server component. Se monta SOLO cuando hay partidos live (el padre lo decide),
 * así no hay polling cuando no hay nada en curso. Respeta pestaña oculta.
 */
export function LiveRefresher({ intervalMs = 60_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const tick = () => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        router.refresh();
      }
    };
    const id = setInterval(tick, intervalMs);
    return () => clearInterval(id);
  }, [router, intervalMs]);

  return null;
}
