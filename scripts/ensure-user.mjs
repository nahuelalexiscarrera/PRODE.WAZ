// Crea/repara la fila public.user para un auth user existente.
// Uso: node scripts/ensure-user.mjs <email> <brandSlug> <role>
//   ej: node scripts/ensure-user.mjs nahuel.alexis.carrera@gmail.com o2 super_admin
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split(/\r?\n/)
    .filter((l) => l && !l.trim().startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const [, , emailArg, brandArg = "o2", roleArg = "super_admin"] = process.argv;
const email = (emailArg || "").toLowerCase();
if (!email) {
  console.error("Falta el email. Uso: node scripts/ensure-user.mjs <email> [brandSlug] [role]");
  process.exit(1);
}

const supa = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function initialsFrom(name) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "??";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

async function main() {
  // 1. Buscar el auth user por email
  const { data: list, error: listErr } = await supa.auth.admin.listUsers();
  if (listErr) throw listErr;
  const authUser = list.users.find((u) => (u.email || "").toLowerCase() === email);
  if (!authUser) {
    console.error(`No existe auth.user con email ${email}. Registrate primero en /${brandArg}/register.`);
    process.exit(1);
  }

  // 2. Resolver la marca
  const { data: brand, error: brandErr } = await supa
    .from("brand")
    .select("id, slug, name")
    .eq("slug", brandArg)
    .maybeSingle();
  if (brandErr) throw brandErr;
  if (!brand) {
    console.error(`No existe la marca '${brandArg}'.`);
    process.exit(1);
  }

  // 3. Nombre desde metadata o derivado del email
  const meta = authUser.user_metadata || {};
  const name =
    (meta.name && String(meta.name).trim()) ||
    email
      .split("@")[0]
      .split(/[._-]/)
      .filter(Boolean)
      .map((s) => s[0].toUpperCase() + s.slice(1))
      .slice(0, 2)
      .join(" ") ||
    "Socio";

  // 4. Upsert de la fila
  const row = {
    id: authUser.id,
    email,
    name,
    initials: initialsFrom(name),
    brand_id: brand.id,
    role: roleArg,
  };
  const { error: upErr } = await supa.from("user").upsert(row, { onConflict: "id" });
  if (upErr) throw upErr;

  console.log("OK — fila public.user creada/actualizada:");
  console.log("  ", JSON.stringify({ ...row, brand: brand.slug }));
}

main().catch((e) => {
  console.error("FATAL:", e.message || e);
  process.exit(1);
});
