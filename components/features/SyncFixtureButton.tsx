/**
 * PRODE.WAZ — Botón "Sincronizar fixture" (panel de admin · partidos).
 *
 * Dispara syncFixtureAction (mismo código que el cron): trae partidos nuevos,
 * horarios reprogramados y resultados de football-data.org a demanda.
 */

"use client";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { syncFixtureAction } from "@/lib/admin/actions";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

export function SyncFixtureButton() {
  const [pending, startTransition] = useTransition();
  const { toast } = useToast();
  const router = useRouter();

  function handleSync() {
    startTransition(async () => {
      const res = await syncFixtureAction();
      if (res.ok) {
        toast({
          variant: "success",
          message:
            res.changes > 0
              ? `Fixture sincronizado · ${res.changes} ${res.changes === 1 ? "cambio" : "cambios"}.`
              : "Fixture sincronizado · sin cambios.",
        });
        router.refresh();
      } else {
        toast({ variant: "error", message: res.error });
      }
    });
  }

  return (
    <div className="px-4 pb-4">
      <Button
        variant="secondary"
        size="sm"
        fullWidth
        loading={pending}
        disabled={pending}
        onClick={handleSync}
      >
        {pending ? "Sincronizando…" : "Sincronizar fixture"}
      </Button>
    </div>
  );
}
