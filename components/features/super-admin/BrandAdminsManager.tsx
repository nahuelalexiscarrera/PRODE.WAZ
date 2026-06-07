"use client";

import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { useToast } from "@/components/ui/Toast";
import {
  assignBrandAdminAction,
  removeBrandAdminAction,
  removeInviteAction,
} from "@/lib/super-admin/actions";
import type { BrandAdminEntry, BrandInviteEntry } from "@/lib/super-admin/queries";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

/**
 * Gestión de administradores de una marca: lista de admins actuales + invites
 * pendientes + alta por email. Cada mutación refresca el server component.
 */
export function BrandAdminsManager({
  brandId,
  admins,
  invites,
}: {
  brandId: string;
  admins: BrandAdminEntry[];
  invites: BrandInviteEntry[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [email, setEmail] = useState("");

  function add() {
    const value = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) {
      toast({ variant: "error", message: "Email inválido." });
      return;
    }
    startTransition(async () => {
      const res = await assignBrandAdminAction({ brandId, email: value });
      if (res.ok) {
        setEmail("");
        toast({
          variant: "success",
          message:
            res.data?.status === "assigned"
              ? "Admin asignado."
              : "Invitación enviada (recibe acceso al registrarse).",
        });
        router.refresh();
      } else {
        toast({ variant: "error", message: res.error });
      }
    });
  }

  function removeAdmin(userId: string) {
    startTransition(async () => {
      const res = await removeBrandAdminAction({ brandId, userId });
      if (res.ok) {
        toast({ variant: "success", message: "Admin removido." });
        router.refresh();
      } else {
        toast({ variant: "error", message: res.error });
      }
    });
  }

  function removeInvite(inviteId: string) {
    startTransition(async () => {
      const res = await removeInviteAction({ brandId, inviteId });
      if (res.ok) {
        toast({ variant: "success", message: "Invitación cancelada." });
        router.refresh();
      } else {
        toast({ variant: "error", message: res.error });
      }
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Alta */}
      <div className="flex items-end gap-2">
        <div className="flex-1">
          <Input
            label="Email del admin"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            leftIcon="users"
          />
        </div>
        <Button onClick={add} loading={pending} size="md">
          Agregar
        </Button>
      </div>

      {/* Lista */}
      {admins.length === 0 && invites.length === 0 ? (
        <p className="text-body-sm text-text-muted text-center py-6">
          Esta marca todavía no tiene administradores.
        </p>
      ) : (
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          {admins.map((a) => (
            <div
              key={a.userId}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
            >
              <Avatar name={a.name} initials={a.initials} avatarUrl={a.avatarUrl} size="sm" />
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-body-sm text-text font-medium truncate">{a.name}</span>
                <span className="text-[11px] text-text-muted truncate">{a.email}</span>
              </div>
              {a.role === "super_admin" ? (
                <Badge variant="accent">Super</Badge>
              ) : (
                <Badge variant="primary">Admin</Badge>
              )}
              {a.role !== "super_admin" && (
                <IconButton
                  icon="trash"
                  label={`Quitar a ${a.name}`}
                  variant="ghost"
                  size="sm"
                  onClick={() => removeAdmin(a.userId)}
                  disabled={pending}
                />
              )}
            </div>
          ))}

          {invites.map((inv) => (
            <div
              key={inv.id}
              className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
            >
              <span className="w-8 h-8 rounded-full bg-surface border border-border flex items-center justify-center flex-shrink-0">
                <Icon name="users" size={14} className="text-text-muted" />
              </span>
              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <span className="text-body-sm text-text truncate">{inv.email}</span>
                <span className="text-[11px] text-text-muted">Pendiente · sin cuenta aún</span>
              </div>
              <Badge variant="warning">Invitado</Badge>
              <IconButton
                icon="x-mark"
                label={`Cancelar invitación a ${inv.email}`}
                variant="ghost"
                size="sm"
                onClick={() => removeInvite(inv.id)}
                disabled={pending}
              />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
