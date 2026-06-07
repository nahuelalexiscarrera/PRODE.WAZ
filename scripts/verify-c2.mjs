// Verifica el modelo de roles (C2): un brand_admin puede leer su propia
// membresía (para que isBrandAdminOf funcione) y el scoping por marca es correcto.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = []; const ts = Date.now(); let uid;
(async () => {
  const { data: brands } = await admin.from("brand").select("id,slug");
  const waz = brands.find((b) => b.slug === "waz").id, o2 = brands.find((b) => b.slug === "o2").id;
  const pw = "C2!" + ts, email = `c2-${ts}@example.com`;
  const { data: au } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  uid = au.user.id;
  await admin.from("user").insert({ id: uid, email, name: "BA", initials: "BA", brand_id: waz, role: "brand_admin" });
  await admin.from("brand_admin").insert({ brand_id: waz, user_id: uid });

  const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email, password: pw });

  // Replica isBrandAdminOf (sesión de usuario): lee role + cuenta membresía
  const { data: me } = await u.from("user").select("role").eq("id", uid).maybeSingle();
  out.push(`${me?.role === "brand_admin" ? "🟢 OK" : "🔴 ROTO"}  [C2-role] brand_admin lee su propio role → ${me?.role}`);

  const { count: wazCount } = await u.from("brand_admin").select("brand_id", { count: "exact", head: true }).eq("brand_id", waz).eq("user_id", uid);
  out.push(`${(wazCount ?? 0) > 0 ? "🟢 OK" : "🔴 ROTO"}  [C2-own] brand_admin VE su membresía en SU marca (waz) → count=${wazCount} (isBrandAdminOf(waz)=${(wazCount ?? 0) > 0})`);

  const { count: o2Count } = await u.from("brand_admin").select("brand_id", { count: "exact", head: true }).eq("brand_id", o2).eq("user_id", uid);
  out.push(`${(o2Count ?? 0) === 0 ? "🟢 OK" : "🔴 ROTO"}  [C2-scope] brand_admin NO administra otra marca (o2) → count=${o2Count} (isBrandAdminOf(o2)=${(o2Count ?? 0) > 0})`);
})().catch((e) => console.error("FATAL:", e.message)).finally(async () => {
  if (uid) { try { await admin.from("brand_admin").delete().eq("user_id", uid); } catch {} try { await admin.auth.admin.deleteUser(uid); } catch {} }
  console.log("\n======= VERIFICACIÓN C2 =======");
  out.forEach((l) => console.log(l));
});
