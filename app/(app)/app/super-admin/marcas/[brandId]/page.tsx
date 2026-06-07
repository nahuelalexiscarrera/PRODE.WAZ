import { ScreenHeader } from "@/components/features/ScreenHeader";
import { BrandAdminsManager } from "@/components/features/super-admin/BrandAdminsManager";
import { BrandForm } from "@/components/features/super-admin/BrandForm";
import { BrandStatusToggle } from "@/components/features/super-admin/BrandStatusToggle";
import { Avatar } from "@/components/ui/Avatar";
import {
  getBrandAdminInvites,
  getBrandAdmins,
  getBrandDetail,
  getBrandMetrics,
  getBrandRankingTop,
  listThemes,
} from "@/lib/super-admin/queries";
import type { UserLevel } from "@/types/domain";
import Image from "next/image";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card rounded-xl border border-border p-4 flex flex-col gap-1">
      <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-text-muted">
        {label}
      </span>
      <span className="font-display text-numeric-lg text-text tabular leading-none">{value}</span>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="px-4 pb-7">
      <h2 className="text-[11px] font-bold uppercase tracking-[0.15em] text-text-muted mb-3">
        {title}
      </h2>
      {children}
    </section>
  );
}

export default async function BrandDetailPage({
  params,
}: {
  params: Promise<{ brandId: string }>;
}) {
  const { brandId } = await params;

  const brand = await getBrandDetail(brandId);
  if (!brand) notFound();

  const [themes, admins, invites, metrics, ranking] = await Promise.all([
    listThemes(),
    getBrandAdmins(brandId),
    getBrandAdminInvites(brandId),
    getBrandMetrics(brandId),
    getBrandRankingTop(brandId, 5),
  ]);

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col">
      <ScreenHeader title={brand.name} backHref="/app/super-admin/marcas" />

      {/* Identidad rápida */}
      <div className="flex items-center gap-3 px-4 pt-2 pb-5">
        {brand.logoUrl ? (
          <Image
            src={brand.logoUrl}
            alt={`${brand.name} logo`}
            width={48}
            height={48}
            unoptimized
            className="w-12 h-12 rounded-lg object-contain border border-border bg-surface"
          />
        ) : null}
        <div className="flex flex-col">
          <span className="text-body-sm text-text-muted">
            /{brand.slug} · #{brand.hashtagSuffix}
          </span>
          <span className="text-[11px] text-text-disabled">
            Link de registro: /register?brand={brand.slug}
          </span>
        </div>
      </div>

      {/* Estado */}
      <div className="pb-6">
        <BrandStatusToggle brandId={brand.id} initialStatus={brand.status} />
      </div>

      {/* Métricas */}
      <Section title="Resumen">
        <div className="grid grid-cols-3 gap-3">
          <Metric label="Socios" value={metrics.socios} />
          <Metric label="Predicc." value={metrics.predicciones} />
          <Metric label="Posts" value={metrics.posts} />
        </div>
      </Section>

      {/* Top ranking */}
      <Section title="Top del ranking">
        {ranking.length === 0 ? (
          <p className="text-body-sm text-text-muted text-center py-6">
            Sin socios rankeados todavía.
          </p>
        ) : (
          <div className="bg-card rounded-xl border border-border overflow-hidden">
            {ranking.map((r) => (
              <div
                key={r.userId}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-border last:border-b-0"
              >
                <span className="w-6 text-center font-display text-numeric-md text-text-muted tabular">
                  {r.position}
                </span>
                <Avatar
                  name={r.name}
                  initials={r.initials}
                  avatarUrl={r.avatarUrl}
                  size="sm"
                  levelBadge={Number(r.level) as UserLevel}
                />
                <span className="text-body-sm text-text flex-1 min-w-0 truncate">{r.name}</span>
                <span className="font-display text-numeric-md text-primary tabular">
                  {r.points}
                </span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* Admins */}
      <Section title="Administradores">
        <BrandAdminsManager brandId={brand.id} admins={admins} invites={invites} />
      </Section>

      {/* Editar */}
      <Section title="Editar marca">
        <div className="-mx-4">
          <BrandForm mode="edit" themes={themes} initial={brand} showStatus={false} />
        </div>
      </Section>
    </div>
  );
}
