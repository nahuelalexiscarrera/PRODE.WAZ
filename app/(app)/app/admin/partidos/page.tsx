import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getIsAdmin } from "@/lib/users/queries";
import { getMatchesForAdmin } from "@/lib/admin/queries";
import { ScreenHeader } from "@/components/features/ScreenHeader";
import { MatchResultManager } from "@/components/features/MatchResultManager";
import { SyncFixtureButton } from "@/components/features/SyncFixtureButton";

export const dynamic = "force-dynamic";

export default async function AdminPartidosPage() {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) redirect("/login");
  if (!(await getIsAdmin())) notFound();

  const matches = await getMatchesForAdmin();

  return (
    <div className="min-h-screen pb-[calc(5rem+env(safe-area-inset-bottom))] flex flex-col">
      <ScreenHeader title="Resultados" backHref="/app/admin" />
      <p className="px-4 pt-2 pb-4 text-body-sm text-text-muted">
        Los resultados llegan solos desde football-data.org. Usá el botón para forzar una
        sincronización ahora, o cargá un resultado a mano si la API se atrasa.
      </p>
      <SyncFixtureButton />
      <MatchResultManager matches={matches} />
    </div>
  );
}
