// Verifica que el hardening NO rompió flujos legítimos.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = [];
const ok = (id, d, pass, detail) => out.push(`${pass ? "🟢 OK      " : "🔴 ROTO    "} [${id}] ${d} → ${detail}`);
const ts = Date.now(); let uid;
(async () => {
  const { data: brands } = await admin.from("brand").select("id,slug");
  const waz = brands.find((b) => b.slug === "waz").id;
  const pw = "Legit!" + ts, email = `legit-${ts}@example.com`;
  const { data: au } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true });
  uid = au.user.id;
  await admin.from("user").insert({ id: uid, email, name: "Legit", initials: "LE", brand_id: waz, total_points: 5 });
  const u = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  await u.auth.signInWithPassword({ email, password: pw });

  // LEGIT-1: usuario edita su nombre
  { const { error } = await u.from("user").update({ name: "NuevoNombre" }).eq("id", uid);
    const { data } = await admin.from("user").select("name").eq("id", uid).maybeSingle();
    ok("L1", "Usuario edita su propio name", !error && data.name === "NuevoNombre", error ? error.message : `name=${data.name}`); }
  // LEGIT-2: usuario cambia visibility
  { const { error } = await u.from("user").update({ visibility: "private" }).eq("id", uid);
    ok("L2", "Usuario cambia su visibility", !error, error ? error.message : "private aplicado"); }
  // LEGIT-3: usuario cambia notification_prefs
  { const { error } = await u.from("user").update({ notification_prefs: { matchReminders: false, results: true, socialReactions: false, weeklyDigest: true } }).eq("id", uid);
    ok("L3", "Usuario cambia notification_prefs", !error, error ? error.message : "prefs aplicadas"); }
  // LEGIT-4: usuario edita avatar
  { const { error } = await u.from("user").update({ avatar_url: "/avatares/a1.png" }).eq("id", uid);
    ok("L4", "Usuario cambia su avatar_url", !error, error ? error.message : "avatar aplicado"); }
  // LEGIT-5: service role suma puntos (flujo de settle/achievements)
  { await admin.from("user").update({ total_points: 100 }).eq("id", uid);
    const { data } = await admin.from("user").select("total_points").eq("id", uid).maybeSingle();
    ok("L5", "service_role actualiza total_points (settle/logros)", data.total_points === 100, `total_points=${data.total_points}`); }
  // LEGIT-6: service role llama fn_add_points (processAchievements/crons)
  { const { error } = await admin.rpc("fn_add_points", { p_user_id: uid, p_delta: 25 });
    const { data } = await admin.from("user").select("total_points").eq("id", uid).maybeSingle();
    ok("L6", "service_role llama fn_add_points (RPC)", !error && data.total_points === 125, error ? error.message : `total_points=${data.total_points}`); }
})().catch((e) => console.error("FATAL:", e.message)).finally(async () => {
  if (uid) { try { await admin.auth.admin.deleteUser(uid); } catch {} }
  console.log("\n======= FLUJOS LEGÍTIMOS (post-hardening) =======");
  out.forEach((l) => console.log(l));
});
