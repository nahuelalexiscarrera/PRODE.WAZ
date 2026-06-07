"use client";

import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { setBrandStatusAction } from "@/lib/super-admin/actions";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/** Toggle rápido de activar/desactivar marca. Optimista con revert ante error. */
export function BrandStatusToggle({
  brandId,
  initialStatus,
}: {
  brandId: string;
  initialStatus: "active" | "inactive";
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [active, setActive] = useState(initialStatus === "active");

  function onChange(next: boolean) {
    setActive(next);
    startTransition(async () => {
      const res = await setBrandStatusAction({
        brandId,
        status: next ? "active" : "inactive",
      });
      if (res.ok) {
        toast({ variant: "success", message: next ? "Marca activada." : "Marca desactivada." });
        router.refresh();
      } else {
        setActive(!next); // revert
        toast({ variant: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex items-center justify-between bg-card rounded-xl border border-border px-4 py-3 mx-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-body-sm text-text font-medium">
          {active ? "Marca activa" : "Marca inactiva"}
        </span>
        <span className="text-[11px] text-text-muted">
          {active ? "Acepta registros y aparece en la plataforma." : "No acepta registros nuevos."}
        </span>
      </div>
      <Switch checked={active} onChange={onChange} disabled={pending} ariaLabel="Estado de la marca" />
    </div>
  );
}
