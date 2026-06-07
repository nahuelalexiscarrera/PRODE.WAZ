// Diagnóstico temporal — estado real de la DB (proyecto NUEVO, service role).
// Uso: node scripts/inspect-db.mjs
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

const url = env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.SUPABASE_SERVICE_ROLE_KEY;
console.log("Proyecto:", url);

const supa = createClient(url, key, { auth: { persistSession: false } });

async function main() {
  // 1. auth.users
  const { data: authData, error: authErr } = await supa.auth.admin.listUsers();
  if (authErr) console.log("auth.listUsers ERROR:", authErr.message);
  else {
    console.log(`\n=== auth.users (${authData.users.length}) ===`);
    for (const u of authData.users) {
      console.log(
        `  ${u.email}  id=${u.id}  confirmed=${!!u.email_confirmed_at}  meta=${JSON.stringify(
          u.user_metadata
        )}`
      );
    }
  }

  // 2. public.user
  const { data: users, error: uErr } = await supa
    .from("user")
    .select("id,email,name,role,brand_id,total_points,position,is_admin");
  console.log(`\n=== public.user (${users?.length ?? "ERR"}) ===`);
  if (uErr) console.log("  ERROR:", uErr.message);
  else for (const u of users) console.log("  ", JSON.stringify(u));

  // 3. brand
  const { data: brands, error: bErr } = await supa
    .from("brand")
    .select("id,slug,name,short_name,sub_brand,hashtag_suffix,logo_url,theme_slug,status");
  console.log(`\n=== brand (${brands?.length ?? "ERR"}) ===`);
  if (bErr) console.log("  ERROR:", bErr.message);
  else for (const b of brands) console.log("  ", JSON.stringify(b));

  // 4. theme (solo slugs)
  const { data: themes, error: tErr } = await supa.from("theme").select("slug,name");
  console.log(`\n=== theme (${themes?.length ?? "ERR"}) ===`);
  if (tErr) console.log("  ERROR:", tErr.message);
  else console.log("  ", themes.map((t) => t.slug).join(", "));

  // 5. counts de datos del torneo
  for (const tbl of ["tournament", "groups", "team", "match", "player"]) {
    const { count, error } = await supa.from(tbl).select("*", { count: "exact", head: true });
    console.log(`  ${tbl}: ${error ? "ERR " + error.message : count}`);
  }

  // 6. brand_admin
  const { data: ba, error: baErr } = await supa.from("brand_admin").select("brand_id,user_id");
  console.log(`\n=== brand_admin (${ba?.length ?? "ERR"}) ===`);
  if (baErr) console.log("  ERROR:", baErr.message);
  else for (const r of ba) console.log("  ", JSON.stringify(r));
}

main().catch((e) => {
  console.error("FATAL:", e);
  process.exit(1);
});
