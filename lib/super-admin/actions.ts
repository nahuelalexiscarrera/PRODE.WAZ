"use server";

/**
 * Super Admin · Server Actions
 *
 * Crear/editar marcas, subir logos (a Supabase Storage), asignar/quitar admins.
 * TODAS gatean con isSuperAdmin() antes de tocar la DB. Las mutaciones usan el
 * cliente service-role (bypassa RLS) pero solo después de verificar el rol.
 */

import { isSuperAdmin } from "@/lib/brands/queries";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { z } from "zod";

export type SuperAdminResult<T = undefined> =
  | { ok: true; data?: T }
  | { ok: false; error: string; field?: string };

const SLUG_RE = /^[a-z0-9-]{2,32}$/;
const HASHTAG_RE = /^[A-Z0-9]{1,16}$/;
// SVG excluido a propósito: un SVG público puede contener <script> y ejecutar
// al navegar la URL directa del bucket (que es público). Solo rasters.
const LOGO_MIME = new Set(["image/png", "image/jpeg", "image/webp"]);
const LOGO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

const brandFieldsSchema = z.object({
  name: z.string().trim().min(2, "Mínimo 2 caracteres").max(40),
  slug: z.string().trim().toLowerCase().regex(SLUG_RE, "Slug inválido (a-z, 0-9, guión; 2-32)"),
  shortName: z.string().trim().max(24).optional().or(z.literal("")),
  subBrand: z.string().trim().max(40).optional().or(z.literal("")),
  hashtagSuffix: z
    .string()
    .trim()
    .toUpperCase()
    .regex(HASHTAG_RE, "Solo letras/números, hasta 16 (sin #)"),
  themeSlug: z.string().trim().min(2).max(32),
  status: z.enum(["active", "inactive"]),
});

/** Gate compartido. */
async function guard(): Promise<SuperAdminResult> {
  if (!(await isSuperAdmin())) return { ok: false, error: "No autorizado." };
  return { ok: true };
}

/** Resuelve el id del super admin actual (para invited_by). */
async function currentUserId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    return user?.id ?? null;
  } catch {
    return null;
  }
}

/** Asigna un admin a una marca por email. Si el email ya tiene cuenta, lo
 *  promueve en el acto (brand_admin row + role). Si no, guarda un invite
 *  pendiente que se reconcilia al registrarse. Idempotente. */
async function assignAdminByEmail(
  admin: ReturnType<typeof createAdminClient>,
  brandId: string,
  rawEmail: string,
  invitedBy: string | null
): Promise<"assigned" | "invited" | "skipped"> {
  const email = rawEmail.trim().toLowerCase();
  if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return "skipped";

  // Lookup case-insensitive: el email guardado puede tener mayúsculas (auth lo
  // preserva tal como se tipeó) y el .eq() estricto lo perdía → caía al path de
  // invite, que para un usuario ya existente no se reconciliaba nunca.
  const emailPattern = email.replace(/[\\%_]/g, (c) => `\\${c}`);
  const { data: u } = await admin
    .from("user")
    .select("id, role")
    .ilike("email", emailPattern)
    .maybeSingle();

  if (u?.id) {
    await admin
      .from("brand_admin")
      .upsert({ brand_id: brandId, user_id: u.id }, { onConflict: "brand_id,user_id" });
    // No degradar super_admins; promover solo members.
    if ((u.role as string) === "member") {
      await admin.from("user").update({ role: "brand_admin" }).eq("id", u.id);
    }
    return "assigned";
  }

  await admin
    .from("brand_admin_invite")
    .upsert({ brand_id: brandId, email, invited_by: invitedBy }, { onConflict: "brand_id,email" });
  return "invited";
}

function parseEmails(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/[\n,;]+/)
    .map((e) => e.trim())
    .filter(Boolean)
    .slice(0, 25);
}

/** Sube un logo al bucket brand-logos y devuelve la URL pública. */
async function uploadLogo(
  admin: ReturnType<typeof createAdminClient>,
  brandId: string,
  file: File
): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  if (!LOGO_MIME.has(file.type)) {
    // SVG queda excluido a propósito (riesgo XSS: un SVG público puede llevar
    // <script>). Ver LOGO_MIME y 20260609_brand_isolation_hardening.sql.
    return { ok: false, error: "Formato no soportado (usá PNG, JPG o WEBP)." };
  }
  if (file.size > LOGO_MAX_BYTES) {
    return { ok: false, error: "El logo supera los 2 MB." };
  }
  const extByMime: Record<string, string> = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/webp": "webp",
  };
  const ext = extByMime[file.type] ?? "png";
  // Path versionado para bustear cache del CDN al re-subir.
  const path = `${brandId}/logo-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const bytes = new Uint8Array(await file.arrayBuffer());

  const { error: upErr } = await admin.storage
    .from("brand-logos")
    .upload(path, bytes, { contentType: file.type, upsert: true });
  if (upErr) return { ok: false, error: "No se pudo subir el logo." };

  const { data: pub } = admin.storage.from("brand-logos").getPublicUrl(path);
  return { ok: true, url: pub.publicUrl };
}

// ─── Crear marca ──────────────────────────────────────────────────────

export async function createBrandAction(
  formData: FormData
): Promise<SuperAdminResult<{ brandId: string }>> {
  const g = await guard();
  if (!g.ok) return g;

  const parsed = brandFieldsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    shortName: formData.get("shortName"),
    subBrand: formData.get("subBrand"),
    hashtagSuffix: formData.get("hashtagSuffix"),
    themeSlug: formData.get("themeSlug"),
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Datos inválidos.",
      field: String(issue?.path?.[0] ?? ""),
    };
  }

  const admin = createAdminClient();

  // Validar que el tema existe.
  const { data: theme } = await admin
    .from("theme")
    .select("slug")
    .eq("slug", parsed.data.themeSlug)
    .maybeSingle();
  if (!theme) return { ok: false, error: "El tema seleccionado no existe.", field: "themeSlug" };

  // Slug único.
  const { data: existing } = await admin
    .from("brand")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();
  if (existing) return { ok: false, error: "Ese slug ya está en uso.", field: "slug" };

  const invitedBy = await currentUserId();

  const { data: brand, error: insErr } = await admin
    .from("brand")
    .insert({
      slug: parsed.data.slug,
      name: parsed.data.name,
      short_name: parsed.data.shortName || null,
      sub_brand: parsed.data.subBrand || null,
      hashtag_suffix: parsed.data.hashtagSuffix,
      theme_slug: parsed.data.themeSlug,
      status: parsed.data.status,
      created_by: invitedBy,
    })
    .select("id")
    .single();
  if (insErr || !brand) return { ok: false, error: "No se pudo crear la marca." };

  const brandId = brand.id as string;

  // Logo obligatorio en create. Validamos antes del insert solo si el campo
  // falta; si el insert ya sucedió y el logo falla, hacemos rollback borrando
  // la marca recién creada para no dejar registros huérfanos sin logo.
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    // No hay logo → borrar la marca recién creada y rechazar.
    await admin.from("brand").delete().eq("id", brandId);
    return { ok: false, error: "El logo es obligatorio para crear una marca.", field: "file" };
  }

  const up = await uploadLogo(admin, brandId, file);
  if (!up.ok) {
    // Error al subir → ídem, borrar la marca y rechazar.
    await admin.from("brand").delete().eq("id", brandId);
    return { ok: false, error: up.error, field: "file" };
  }
  await admin.from("brand").update({ logo_url: up.url }).eq("id", brandId);

  // Admins por email.
  for (const email of parseEmails(formData.get("adminEmails") as string | null)) {
    await assignAdminByEmail(admin, brandId, email, invitedBy);
  }

  revalidatePath("/app/super-admin");
  revalidatePath("/app/super-admin/marcas");
  return { ok: true, data: { brandId } };
}

// ─── Editar marca ─────────────────────────────────────────────────────

export async function updateBrandAction(
  formData: FormData
): Promise<SuperAdminResult<{ brandId: string }>> {
  const g = await guard();
  if (!g.ok) return g;

  const brandId = String(formData.get("brandId") ?? "");
  if (!z.string().uuid().safeParse(brandId).success) {
    return { ok: false, error: "Marca inválida." };
  }

  const parsed = brandFieldsSchema.safeParse({
    name: formData.get("name"),
    slug: formData.get("slug"),
    shortName: formData.get("shortName"),
    subBrand: formData.get("subBrand"),
    hashtagSuffix: formData.get("hashtagSuffix"),
    themeSlug: formData.get("themeSlug"),
    status: formData.get("status") ?? "active",
  });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? "Datos inválidos.",
      field: String(issue?.path?.[0] ?? ""),
    };
  }

  const admin = createAdminClient();

  // Slug único (excluyendo la propia marca).
  const { data: clash } = await admin
    .from("brand")
    .select("id")
    .eq("slug", parsed.data.slug)
    .neq("id", brandId)
    .maybeSingle();
  if (clash) return { ok: false, error: "Ese slug ya está en uso por otra marca.", field: "slug" };

  const { error } = await admin
    .from("brand")
    .update({
      name: parsed.data.name,
      slug: parsed.data.slug,
      short_name: parsed.data.shortName || null,
      sub_brand: parsed.data.subBrand || null,
      hashtag_suffix: parsed.data.hashtagSuffix,
      theme_slug: parsed.data.themeSlug,
      status: parsed.data.status,
    })
    .eq("id", brandId);
  if (error) return { ok: false, error: "No se pudo guardar la marca." };

  // Logo nuevo (opcional).
  const file = formData.get("file");
  if (file instanceof File && file.size > 0) {
    const up = await uploadLogo(admin, brandId, file);
    if (up.ok) {
      await admin.from("brand").update({ logo_url: up.url }).eq("id", brandId);
    } else {
      return { ok: false, error: up.error, field: "file" };
    }
  }

  revalidatePath("/app/super-admin");
  revalidatePath("/app/super-admin/marcas");
  revalidatePath(`/app/super-admin/marcas/${brandId}`);
  return { ok: true, data: { brandId } };
}

// ─── Activar / desactivar ─────────────────────────────────────────────

export async function setBrandStatusAction(input: {
  brandId: string;
  status: "active" | "inactive";
}): Promise<SuperAdminResult> {
  const g = await guard();
  if (!g.ok) return g;

  const schema = z.object({
    brandId: z.string().uuid(),
    status: z.enum(["active", "inactive"]),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("brand")
    .update({ status: parsed.data.status })
    .eq("id", parsed.data.brandId);
  if (error) return { ok: false, error: "No se pudo cambiar el estado." };

  revalidatePath("/app/super-admin");
  revalidatePath("/app/super-admin/marcas");
  revalidatePath(`/app/super-admin/marcas/${parsed.data.brandId}`);
  return { ok: true };
}

// ─── Subir logo (desde el detalle) ───────────────────────────────────

export async function uploadBrandLogoAction(
  formData: FormData
): Promise<SuperAdminResult<{ url: string }>> {
  const g = await guard();
  if (!g.ok) return g;

  const brandId = String(formData.get("brandId") ?? "");
  if (!z.string().uuid().safeParse(brandId).success) {
    return { ok: false, error: "Marca inválida." };
  }
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Elegí un archivo." };
  }

  const admin = createAdminClient();
  const up = await uploadLogo(admin, brandId, file);
  if (!up.ok) return { ok: false, error: up.error };

  const { error } = await admin.from("brand").update({ logo_url: up.url }).eq("id", brandId);
  if (error) return { ok: false, error: "Logo subido pero no se pudo guardar." };

  revalidatePath("/app/super-admin/marcas");
  revalidatePath(`/app/super-admin/marcas/${brandId}`);
  return { ok: true, data: { url: up.url } };
}

// ─── Asignar / quitar admins ─────────────────────────────────────────

export async function assignBrandAdminAction(input: {
  brandId: string;
  email: string;
}): Promise<SuperAdminResult<{ status: "assigned" | "invited" | "skipped" }>> {
  const g = await guard();
  if (!g.ok) return g;

  const schema = z.object({ brandId: z.string().uuid(), email: z.string().email() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Email inválido." };

  const admin = createAdminClient();
  const invitedBy = await currentUserId();
  const status = await assignAdminByEmail(admin, parsed.data.brandId, parsed.data.email, invitedBy);

  revalidatePath(`/app/super-admin/marcas/${parsed.data.brandId}`);
  return { ok: true, data: { status } };
}

export async function removeBrandAdminAction(input: {
  brandId: string;
  userId: string;
}): Promise<SuperAdminResult> {
  const g = await guard();
  if (!g.ok) return g;

  const schema = z.object({ brandId: z.string().uuid(), userId: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const admin = createAdminClient();
  const { error } = await admin
    .from("brand_admin")
    .delete()
    .eq("brand_id", parsed.data.brandId)
    .eq("user_id", parsed.data.userId);
  if (error) return { ok: false, error: "No se pudo quitar el admin." };

  // Si el user ya no administra ninguna marca y es brand_admin, lo bajamos a member.
  const { count } = await admin
    .from("brand_admin")
    .select("*", { count: "exact", head: true })
    .eq("user_id", parsed.data.userId);
  if ((count ?? 0) === 0) {
    await admin
      .from("user")
      .update({ role: "member" })
      .eq("id", parsed.data.userId)
      .eq("role", "brand_admin"); // nunca degradar a un super_admin
  }

  revalidatePath(`/app/super-admin/marcas/${parsed.data.brandId}`);
  return { ok: true };
}

export async function removeInviteAction(input: {
  brandId: string;
  inviteId: string;
}): Promise<SuperAdminResult> {
  const g = await guard();
  if (!g.ok) return g;

  const schema = z.object({ brandId: z.string().uuid(), inviteId: z.string().uuid() });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos." };

  const admin = createAdminClient();
  const { error } = await admin.from("brand_admin_invite").delete().eq("id", parsed.data.inviteId);
  if (error) return { ok: false, error: "No se pudo quitar la invitación." };

  revalidatePath(`/app/super-admin/marcas/${parsed.data.brandId}`);
  return { ok: true };
}
