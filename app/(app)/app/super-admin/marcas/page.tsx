import { ScreenHeader } from "@/components/features/ScreenHeader";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { listBrandsWithStats } from "@/lib/super-admin/queries";
import Image from "next/image";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function MarcasPage() {
  const brands = await listBrandsWithStats();

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col">
      <ScreenHeader
        title="Marcas"
        backHref="/app/super-admin"
        actions={
          <Link
            href="/app/super-admin/marcas/nueva"
            aria-label="Crear nueva marca"
            className="flex items-center justify-center w-9 h-9 rounded-lg bg-surface border border-border text-primary"
          >
            <Icon name="plus" size={18} />
          </Link>
        }
      />

      <p className="px-4 pt-2 pb-4 text-body-sm text-text-muted">
        {brands.length} {brands.length === 1 ? "marca" : "marcas"} en la plataforma.
      </p>

      {brands.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
          <p className="text-body-sm text-text-muted">
            Todavía no hay ninguna marca. Creá la primera para arrancar.
          </p>
          <Link
            href="/app/super-admin/marcas/nueva"
            className="inline-flex items-center gap-2 h-12 px-6 rounded-full bg-primary text-text-inverse font-semibold text-body-sm"
          >
            <Icon name="plus" size={18} />
            Crear marca
          </Link>
        </div>
      ) : (
        <div className="px-4 flex flex-col gap-3">
          {brands.map((b) => (
            <Link
              key={b.id}
              href={`/app/super-admin/marcas/${b.id}`}
              className="bg-card rounded-xl border border-border p-4 flex items-center gap-3 hover:border-border-strong transition-colors"
            >
              {b.logoUrl ? (
                <Image
                  src={b.logoUrl}
                  alt={`${b.name} logo`}
                  width={44}
                  height={44}
                  unoptimized
                  className="w-11 h-11 rounded-lg object-contain border border-border bg-surface flex-shrink-0"
                />
              ) : (
                <span
                  className="w-11 h-11 rounded-lg flex-shrink-0 border border-border flex items-center justify-center"
                  style={{ background: `${b.themePrimary}1f` }}
                  aria-hidden="true"
                >
                  <span
                    className="font-display text-heading-sm leading-none"
                    style={{ color: b.themePrimary }}
                  >
                    {(b.shortName ?? b.name).slice(0, 2).toUpperCase()}
                  </span>
                </span>
              )}

              <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-body-md text-text font-semibold truncate">{b.name}</span>
                  {b.status === "active" ? (
                    <Badge variant="success">Activa</Badge>
                  ) : (
                    <Badge variant="default">Inactiva</Badge>
                  )}
                </div>
                <span className="text-[11px] text-text-muted truncate">
                  /{b.slug} · {b.memberCount}{" "}
                  {b.memberCount === 1 ? "socio" : "socios"}
                </span>
                <span className="text-[11px] text-text-disabled truncate">
                  {b.adminPrincipal ? `Admin: ${b.adminPrincipal.name}` : "Sin admin · solo Super Admin"}
                </span>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span
                    className="w-3 h-3 rounded-full border border-border flex-shrink-0"
                    style={{ background: b.themePrimary }}
                    aria-hidden="true"
                  />
                  <span className="text-[11px] text-text-disabled truncate">{b.themeName}</span>
                </div>
              </div>

              <Icon name="arrow-right" size={18} className="text-text-muted flex-shrink-0" />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
