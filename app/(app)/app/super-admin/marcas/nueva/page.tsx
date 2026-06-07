import { ScreenHeader } from "@/components/features/ScreenHeader";
import { BrandForm } from "@/components/features/super-admin/BrandForm";
import { listThemes } from "@/lib/super-admin/queries";

export const dynamic = "force-dynamic";

export default async function NuevaMarcaPage() {
  const themes = await listThemes();

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col">
      <ScreenHeader title="Nueva marca" backHref="/app/super-admin/marcas" />
      <p className="px-4 pt-2 pb-5 text-body-sm text-text-muted">
        Cargá los datos, elegí un tema y (opcional) sumá administradores. Podés editar todo después.
      </p>
      <BrandForm mode="create" themes={themes} />
    </div>
  );
}
