/**
 * PRODE.WAZ — Self-heal de la fila public.user.
 *
 * La fila en `user` se crea al registrarse (signUpAction con email-confirm OFF) o
 * al confirmar el email (/auth/confirm). Pero una sesión válida SIN fila (sesión
 * huérfana tras un reset de DB, o un registro donde el insert falló) deja la app
 * a medias: getMyProfile() devuelve null, /perfil rebota, los roles no se pueden
 * setear. Estas funciones garantizan la fila para cualquier user autenticado.
 *
 * Dos entradas:
 *  - `ensureUserRowFor(user)`: toma el objeto User directamente. Seguro de llamar
 *    en el MISMO request que signUp()/signInWithPassword(), donde la cookie de
 *    sesión recién creada todavía NO es legible por un client nuevo. Usa el admin
 *    client (service role) → no necesita sesión.
 *  - `ensureCurrentUserRow()`: resuelve el user vía la sesión (getUser) y delega.
 *    Cacheada per-request. Para usar desde layouts/pages (request ya con sesión).
 *
 * Ambas son idempotentes (no-op si la fila existe) y fail-safe (nunca tiran: se
 * llaman desde el layout; si fallaran, romperían el render).
 */

import "server-only";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { deriveInitials } from "@/lib/auth/initials";
import { DEFAULT_BRAND_SLUG } from "@/lib/brands/queries";

type AdminClient = ReturnType<typeof createAdminClient>;

/** Resuelve el id de una marca por slug. undefined si no existe. */
async function brandIdBySlug(admin: AdminClient, slug: string): Promise<string | undefined> {
  const { data } = await admin.from("brand").select("id").eq("slug", slug).maybeSingle();
  return (data as { id?: string } | null)?.id;
}

/** brand_id a usar para un user nuevo: slug pedido → default → cualquier activa.
 *  La columna es NOT NULL, así que SIEMPRE intentamos devolver algo usable. */
async function resolveBrandId(admin: AdminClient, requestedSlug: string): Promise<string | undefined> {
  return (
    (await brandIdBySlug(admin, requestedSlug)) ??
    (await brandIdBySlug(admin, DEFAULT_BRAND_SLUG)) ??
    (await (async () => {
      const { data } = await admin
        .from("brand")
        .select("id")
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      return (data as { id?: string } | null)?.id;
    })())
  );
}

/** Reconciliación de invitaciones de brand_admin por email (idempotente). */
async function reconcileBrandAdminInvites(
  admin: AdminClient,
  userId: string,
  email: string | undefined
): Promise<void> {
  try {
    const e = (email ?? "").toLowerCase();
    if (!e) return;
    const { data: invites } = await admin
      .from("brand_admin_invite")
      .select("id, brand_id")
      .eq("email", e)
      .is("consumed_at", null);
    if (!invites || invites.length === 0) return;

    const nowIso = new Date().toISOString();
    for (const inv of invites) {
      await admin
        .from("brand_admin")
        .upsert(
          { brand_id: inv.brand_id as string, user_id: userId },
          { onConflict: "brand_id,user_id" }
        );
      await admin
        .from("brand_admin_invite")
        .update({ consumed_at: nowIso })
        .eq("id", inv.id as string);
    }
    // Promover a brand_admin sin pisar un super_admin.
    await admin.from("user").update({ role: "brand_admin" }).eq("id", userId).eq("role", "member");
  } catch {
    // No romper si la tabla no existe o algo falla.
  }
}

/** Crea la fila public.user para un auth user dado. Idempotente + fail-safe.
 *  Toma el User directamente → seguro en el mismo request que signUp/signIn. */
export async function ensureUserRowFor(user: User, brandSlugOverride?: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: existing } = await admin
      .from("user")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();
    if (existing) return;

    const meta = (user.user_metadata ?? {}) as {
      name?: string;
      full_name?: string;
      phone?: string | null;
      referralCode?: string;
      brandSlug?: string;
    };
    // full_name lo provee Google (OAuth). brandSlugOverride viene del callback
    // OAuth, donde la marca NO viaja en user_metadata sino en el redirect.
    const name = meta.name?.trim() || meta.full_name?.trim() || user.email?.split("@")[0] || "Socio";
    const hint = brandSlugOverride?.trim().toLowerCase() || meta.brandSlug?.trim().toLowerCase() || "";
    const requestedSlug = hint || DEFAULT_BRAND_SLUG;
    // Sin NINGUNA pista de marca, anclamos al default (waz). Lo dejamos registrado
    // para detectar altas "sin club claro" (el peor caso de producto: socio de un
    // gym que termina en el prode equivocado). Si hint vino pero no resuelve, el
    // fallback de resolveBrandId también cae acá — por eso logueamos el pedido.
    if (!hint) {
      console.warn(`[ensureUserRowFor] alta sin marca explícita → default '${DEFAULT_BRAND_SLUG}' (user ${user.email})`);
    }

    const brandId = await resolveBrandId(admin, requestedSlug);
    if (!brandId) {
      // No hay NINGUNA marca activa: no podemos cumplir el NOT NULL. No romper.
      console.error("[ensureUserRowFor] no hay marca activa para asignar — fila no creada");
      return;
    }

    const { error: insErr } = await admin.from("user").insert({
      id: user.id,
      email: user.email,
      name,
      initials: deriveInitials(name),
      phone: meta.phone ?? null,
      brand_id: brandId,
    });
    if (insErr) {
      // Si fue carrera (otra request creó la fila), el conflicto de PK es benigno.
      if (insErr.code !== "23505") {
        console.error("[ensureUserRowFor] insert falló", insErr.message);
      }
      return;
    }

    // Referido propio + link al referidor si vino uno (graceful si faltan columnas).
    const updates: Record<string, unknown> = {
      referral_code: crypto.randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase(),
    };
    if (meta.referralCode) {
      const { data: referrer } = await admin
        .from("user")
        .select("id")
        .eq("referral_code", meta.referralCode.toUpperCase())
        .maybeSingle();
      if (referrer && referrer.id !== user.id) updates.referred_by = referrer.id;
    }
    await admin.from("user").update(updates).eq("id", user.id);

    await reconcileBrandAdminInvites(admin, user.id, user.email);
  } catch (e) {
    console.error("[ensureUserRowFor] error", e);
  }
}

/** Variante que resuelve el user desde la sesión. Cacheada per-request.
 *  Para layouts/pages (el request ya trae una sesión legible). */
export const ensureCurrentUserRow = cache(async (): Promise<void> => {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    await ensureUserRowFor(user);
  } catch (e) {
    console.error("[ensureCurrentUserRow] error", e);
  }
});
