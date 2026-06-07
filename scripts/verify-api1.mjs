// Verifica el re-settle por corrección VAR (API1): settle inicial → cambia el
// resultado → fn_resettle_match revierte los puntos viejos y re-puntúa.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
const env = Object.fromEntries(readFileSync(".env.local", "utf8").split(/\r?\n/)
  .filter((l) => l && !l.trim().startsWith("#") && l.includes("=")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const out = []; const ts = Date.now(); let uid, tid, mid;
const points = async (id) => (await admin.from("user").select("total_points").eq("id", id).maybeSingle()).data?.total_points;
(async () => {
  const { data: brands } = await admin.from("brand").select("id,slug");
  const waz = brands.find((b) => b.slug === "waz").id;
  // torneo + partido (ar vs br, grupos)
  const { data: t } = await admin.from("tournament").insert({ slug: `api1-${ts}`, display_name: "API1", short_name: "API1", start_date: "2026-06-01", end_date: "2026-07-01", phase_config: {}, active: false }).select("id").single();
  tid = t.id;
  const { data: m } = await admin.from("match").insert({ tournament_id: tid, phase: "groups", home_code: "ar", away_code: "br", kickoff_at: new Date(Date.now() - 7200e3).toISOString(), status: "scheduled" }).select("id").single();
  mid = m.id;
  // user + predicción: ar 2 - br 0 (predice victoria de ar 2-0)
  const email = `api1-${ts}@example.com`;
  const { data: au } = await admin.auth.admin.createUser({ email, password: "Api1!" + ts, email_confirm: true });
  uid = au.user.id;
  await admin.from("user").insert({ id: uid, email, name: "API1", initials: "A1", brand_id: waz, total_points: 0 });
  await admin.from("prediction").insert({ user_id: uid, match_id: mid, home_score: 2, away_score: 0, brand_id: waz });

  // settle inicial: resultado REAL ar 2-0 (acierto exacto → 8 pts en grupos)
  await admin.from("match_result").insert({ match_id: mid, home_score: 2, away_score: 0 });
  await admin.from("match").update({ status: "finished" }).eq("id", mid); // dispara fn_settle_match
  const p1 = await points(uid);
  out.push(`${p1 === 8 ? "🟢 OK" : "🔴 ROTO"}  [API1-settle] acierto exacto 2-0 en grupos → ${p1} pts (esperado 8)`);

  // corrección VAR: el resultado real pasa a ar 0-2 (br gana). Predijo ar → 0 pts.
  await admin.from("match_result").upsert({ match_id: mid, home_score: 0, away_score: 2, finished_at: new Date().toISOString() }, { onConflict: "match_id" });
  const { error: reErr } = await admin.rpc("fn_resettle_match", { p_match_id: mid });
  const p2 = await points(uid);
  out.push(`${!reErr && p2 === 0 ? "🟢 OK" : "🔴 ROTO"}  [API1-resettle] VAR cambia a 0-2 → re-puntúa a ${p2} pts (esperado 0)${reErr ? " err:" + reErr.message : ""}`);
})().catch((e) => console.error("FATAL:", e.message)).finally(async () => {
  if (uid) { try { await admin.auth.admin.deleteUser(uid); } catch {} }
  if (tid) { try { await admin.from("tournament").delete().eq("id", tid); } catch (e) { console.error("del t", e.message); } }
  console.log("\n======= VERIFICACIÓN API1 (VAR re-settle) =======");
  out.forEach((l) => console.log(l));
});
