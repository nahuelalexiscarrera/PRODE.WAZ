import { NavRow } from "@/components/features/NavRow";
import { ScreenHeader } from "@/components/features/ScreenHeader";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { getGlobalStats, listBrandsWithStats } from "@/lib/super-admin/queries";
import Link from "next/link";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function Metric({ label, value, sub }: { label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <span className="font-display text-numeric-lg text-text tabular leading-none">{value}</span>
      {sub ? <span className="text-[11px] text-text-disabled">{sub}</span> : null}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-4 pb-6">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">
        {title}
      </h2>
      <div className="grid grid-cols-2 gap-3">{children}</div>
    </section>
  );
}

export default async function SuperAdminPage() {
  const [stats, brands] = await Promise.all([getGlobalStats(), listBrandsWithStats()]);

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col">
      <ScreenHeader title="Super Admin" backHref="/app/perfil" />

      <p className="px-4 pt-2 pb-5 text-body-sm text-text-muted">
        Gestión de marcas, temas y administradores de toda la plataforma.
      </p>

      <div className="mx-4 mb-6 bg-card rounded-xl border border-border overflow-hidden">
        <NavRow
          href="/app/super-admin/marcas"
          label="Marcas"
          badge={<Badge variant="primary">{stats.brands}</Badge>}
        />
        <NavRow href="/app/super-admin/marcas/nueva" label="Crear nueva marca" />
        <NavRow href="/app/admin" label="Operaciones de plataforma (resultados, logros)" />
      </div>

      <Section title="Plataforma">
        <Metric label="Marcas" value={stats.brands} sub={`${stats.brandsActive} activas`} />
        <Metric label="Socios" value={stats.socios} sub={`+${stats.sociosNuevos7d} en 7 días`} />
        <Metric label="Predicciones" value={stats.predicciones} sub="en total" />
        <Metric label="Posts" value={stats.posts} sub="en todos los muros" />
      </Section>

      {/* Resumen rápido de marcas */}
      <section className="px-4 pb-8">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted">
            Marcas
          </h2>
          <Link
            href="/app/super-admin/marcas/nueva"
            className="inline-flex items-center gap-1 text-body-sm text-primary font-semibold"
          >
            <Icon name="plus" size={16} />
            Nueva
          </Link>
        </div>

        {brands.length === 0 ? (
          <p className="text-body-sm text-text-muted text-center py-8">
            Todavía no hay marcas. Creá la primera.
          </p>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {brands.map((b) => (
              <Link
                key={b.id}
                href={`/app/super-admin/marcas/${b.id}`}
                className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0 hover:bg-elevated/50 transition-colors"
              >
                <span
                  className="w-8 h-8 rounded-md flex-shrink-0 border border-border"
                  style={{ background: b.themePrimary }}
                  aria-hidden="true"
                />
                <div className="flex flex-col gap-0.5 flex-1 min-w-0">
                  <span className="text-body-sm text-text font-medium truncate">{b.name}</span>
                  <span className="text-[11px] text-text-muted truncate">
                    /{b.slug} · {b.memberCount} socios · {b.themeName}
                  </span>
                </div>
                {b.status === "active" ? (
                  <Badge variant="success">Activa</Badge>
                ) : (
                  <Badge variant="default">Inactiva</Badge>
                )}
                <Icon name="arrow-right" size={16} className="text-text-muted" />
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
