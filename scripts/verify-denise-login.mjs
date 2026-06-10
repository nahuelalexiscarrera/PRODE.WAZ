// Verificación E2E — usuario del club "denise" entra a SU prode (no WAZ).
// Crea un user de prueba como lo deja el registro branded (metadata.brandSlug
// = 'denise', email confirmado, SIN fila public.user) para validar que el
// login (ensureUserRowFor) lo ancla a la marca correcta.
// Uso: node scripts/verify-denise-login.mjs [cleanup <userId>]
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

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const [mode, arg] = process.argv.slice(2);

async function main() {
  if (mode === "cleanup") {
    if (!arg) throw new Error("cleanup necesita el userId");
    await admin.from("user").delete().eq("id", arg);
    await admin.auth.admin.deleteUser(arg);
    console.log("cleanup OK:", arg);
    return;
  }

  if (mode === "check") {
    if (!arg) throw new Error("check necesita el userId");
    const { data: row } = await admin
      .from("user")
      .select("id,email,name,brand_id,role")
      .eq("id", arg)
      .maybeSingle();
    const { data: brands } = await admin.from("brand").select("id,slug,name");
    const brand = brands.find((b) => b.id === row?.brand_id);
    console.log(JSON.stringify({ row, resolvedBrand: brand ?? null }, null, 2));
    return;
  }

  const ts = Date.now();
  const email = `qa-denise-${ts}@example.com`;
  const password = `Denise!${ts}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { name: "QA Socio Denise", brandSlug: "denise" },
  });
  if (error) throw error;
  console.log(JSON.stringify({ userId: data.user.id, email, password }));
}

main().catch((e) => {
  console.error("FATAL:", e.message ?? e);
  process.exit(1);
});
