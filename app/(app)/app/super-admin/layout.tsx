/**
 * Super Admin · gate único de toda la sección.
 *
 * El layout corre para /app/super-admin/** : verifica sesión + rol super_admin
 * una sola vez. Si no es super admin → notFound() (404, no filtra que la ruta
 * existe). Las páginas hijas asumen el gate y solo fetchean data.
 */

import { isSuperAdmin } from "@/lib/brands/queries";
import { createClient } from "@/lib/supabase/server";
import { notFound, redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SuperAdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data?.user) redirect("/login");
  if (!(await isSuperAdmin())) notFound();

  return <>{children}</>;
}
