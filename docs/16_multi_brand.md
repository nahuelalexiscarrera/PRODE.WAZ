# 16 · Multi-Marca

**Fecha:** 2026-06-07 · **Migración:** `supabase/migrations/20260607_multi_brand.sql`

---

## 1. Por qué

PRODE arrancó como app single-tenant para socios del gimnasio O2 (~800 personas). El producto se evolucionó a una **plataforma multi-marca**: cualquier comunidad (otro gimnasio, club, empresa) puede tener su propio prode del Mundial con usuarios, ranking y branding independientes — todo sobre la misma infra (mismo código, mismo Supabase, mismo Vercel).

Decisión de tenancy: **user-bound**. Cada `user.brand_id` ancla a una marca; el link de invitación trae el slug (`/register?brand=fitclub`) y el sistema lo persiste al confirmar el email. Una vez registrado, el socio no salta entre marcas — su sesión = su marca. Sin subdominios, sin path prefixes.

## 2. Arquitectura

```
┌────────── auth ──────────┐    ┌────────── runtime ──────────┐    ┌────────── data ──────────┐
│ /register?brand=fitclub  │ ─► │ getCurrentBrand() en server │ ─► │ user(brand_id)           │
│ signUpAction valida slug │    │   layout (app)/layout.tsx   │    │ prediction(brand_id)     │
│ user_metadata.brandSlug  │    │ themeToCssVars(...) → CSS   │    │ post(brand_id)           │
│ /auth/confirm resuelve   │    │ <BrandProvider/> → useBrand │    │ RLS isola por marca      │
│   brand_id e inserta     │    │ ScreenHeader, ShareButton…  │    │ fn_*_for_brand(brand_id) │
└──────────────────────────┘    └─────────────────────────────┘    └──────────────────────────┘
```

### Entidades nuevas

- **`theme`** (PK `slug`) — catálogo reutilizable de tokens visuales. Tokens son un JSONB de overrides CSS. La migración seedea ocho: `hiit-zone` (default), `power-lift`, `endurance-core`, `recovery-flow`, `padel-court`, `pro-impact`, `crossfit-yellow`, `style-waz`.
- **`brand`** (PK UUID, UNIQUE `slug`) — la marca. Tiene `name`, `short_name`, `sub_brand` ("Wellness Club" para O2), `hashtag_suffix`, `logo_url`, `theme_slug` (FK), `status`.
- **`brand_admin`** (N:M `brand_id` × `user_id`) — admins de una marca específica.

### Roles

`user_role_t` enum: `'member' | 'brand_admin' | 'super_admin'`. La columna `user.role` reemplaza al booleano `is_admin` (que queda sincronizado por trigger durante la transición). Helpers SQL: `current_brand_id()`, `is_super_admin()`, `is_brand_admin(brand_id)`, y la versión actualizada de `is_admin()` que cubre super y brand admins.

### Columnas denormalizadas

`brand_id` se denormaliza en `user`, `prediction`, `special_prediction`, `post`, `ranking_snapshot`. Otras tablas (`comment`, `reaction`, `notification`, `push_subscription`, `user_achievement`, `share_intent`) heredan transitivamente via `user_id`.

### Funciones SQL reescritas

| Antes | Después |
|---|---|
| `fn_recalculate_positions()` (global) | `fn_recalculate_positions(p_brand_id UUID)` |
| — | `fn_recalculate_positions_all()` — itera por marcas activas |
| `fn_settle_match(p_match_id)` llamaba al recalc global | Resuelve `SELECT DISTINCT brand_id FROM prediction WHERE match_id` y recalcula cada marca afectada |
| `fn_add_points(p_user_id, p_delta)` | Idem, resolve `brand_id` desde el user antes del recalc |

### Views → funciones parametrizadas

`mv_user_summary` y `mv_ranking_global` (globales, inherentemente single-tenant) fueron eliminadas y reemplazadas por funciones live:

- `fn_user_summary_for_brand(p_brand_id UUID)`
- `fn_ranking_for_brand(p_brand_id UUID, p_limit INTEGER DEFAULT 100)`

El cron `refresh-views` quedó como no-op deprecado.

### RLS — patrón de aislamiento

Toda tabla user-data extiende su policy de SELECT con el predicado:

```sql
USING (auth.role() = 'authenticated'
       AND (brand_id = public.current_brand_id() OR public.is_super_admin()))
```

Tablas reference (`tournament`, `team`, `match`, `match_result`, `groups`, `player`, `achievement_catalog`) siguen siendo lectura pública — son datos compartidos del Mundial.

## 3. Application surface

### Server queries

- **`lib/brands/queries.ts`** — `getCurrentBrand()`, `getBrandBySlug()`, `getBrandForUserId()`, `listActiveBrands()`, guards (`assertSuperAdmin`, `assertBrandAdminOf`).
- **`lib/ranking/queries.ts`** — `getBrandRanking(brandId?, limit)` (con alias `getGlobalRanking` para back-compat). Si no se pasa `brandId`, lo deriva de la sesión.
- **`lib/social/queries.ts`** — `getFeedRecientes`, `getFeedDestacados`, `getPostDetail` ahora filtran por `brand_id` del usuario autenticado.

### Server actions (insertan `brand_id`)

- `upsertPrediction`, `upsertSpecialPrediction` (en `lib/predictions/actions.ts`).
- `createPost` (en `lib/social/actions.ts`).

### Theming

- **`lib/brands/theme.ts`** — `themeToCssVars(tokens)` genera el objeto de CSS vars (`--brand-primary`, `--accent-lime`, etc.) con merge sobre `DEFAULT_THEME_TOKENS` y sanitización.
- **`app/(app)/layout.tsx`** — server component que llama `getCurrentBrand()`, aplica `style={cssVars}` al wrapper, y envuelve children con `<BrandProvider>`.
- **`app/(auth)/layout.tsx`** — resolve por `?brand=<slug>` o cookie `o2p_brand`, fallback a `o2`.

### Client context

**`components/providers/BrandProvider.tsx`** — `useBrand()` (puede ser null) y `useBrandRequired()` (tira si null). Expone metadata (`name`, `logoUrl`, `hashtagSuffix`, `subBrand`) — NO los tokens del theme (esos viajan como CSS vars).

### Share

`app/api/share/[template]/[userId]/route.ts` fetchea la marca del user vía REST API directo (edge runtime no soporta el SSR client) y la pasa a `renderTemplate(data, format, origin, brand)`. Cada template (`T01_Summary`, `T02_Position`, `T03_Match`, `T04_Achievement`) recibe `brand: BrandShareContext` con `primary`, `accent`, `name`, `hashtagSuffix`, `logoUrl`.

### Copy

`lib/i18n/es-AR.json` introduce placeholders `{brandName}`, `{hashtagSuffix}`, `{subBrand}`. Resolver en `lib/i18n/resolve.ts` (`resolveCopy(template, brand)`).

`lib/achievements/levels.ts` cambia el nivel 5 de "Leyenda O2" a "Leyenda" (canónico) + helper `displayLevelName(meta, brand)` que devuelve "Leyenda {brandName}".

## 4. Flujo de registro multi-marca

1. Super Admin crea una marca: `INSERT INTO brand (slug, name, hashtag_suffix, theme_slug, ...)`. UI todavía no — se hace por SQL.
2. Super Admin comparte el link de invitación: `https://prode.app/register?brand=fitclub`.
3. El usuario abre el link → `app/(auth)/layout.tsx` resuelve `fitclub` y hidrata branding (logo, colores, copy "Hacete socio FitClub PRODE").
4. Completa el form → `signUpAction` valida el slug, lo guarda en `auth.users.user_metadata.brandSlug`, y dispara el mail de confirmación.
5. El usuario click confirma → `app/auth/confirm/route.ts` `ensureUserRow()` lee el slug del metadata, resuelve el UUID, e inserta `user.brand_id`.
6. Login subsiguiente: `getCurrentBrand()` resuelve siempre por `user.brand_id`. La sesión = la marca.

## 5. Cómo agregar una marca nueva (mientras no hay UI)

```sql
-- Suponiendo que ya existe el tema 'corporate' (lo seedea la migración):
INSERT INTO brand (slug, name, short_name, sub_brand, hashtag_suffix, theme_slug, logo_url, status)
VALUES (
  'fitclub',
  'FitClub',
  'FitClub',
  'Performance Studio',
  'FITCLUB',
  'corporate',
  'https://supabase.../storage/v1/object/public/brand-logos/fitclub.png',
  'active'
);

-- Asignar un brand_admin (después de que ese user se registre):
INSERT INTO brand_admin (brand_id, user_id)
VALUES (
  (SELECT id FROM brand WHERE slug = 'fitclub'),
  '<uuid-del-user>'
);

-- Subir role a brand_admin:
UPDATE "user" SET role = 'brand_admin' WHERE id = '<uuid-del-user>';
```

Después: invitá al link `https://prode.app/register?brand=fitclub`.

## 6. Super Admin (implementado 2026-06-08)

Panel en `/app/super-admin`, gateado por `isSuperAdmin()` en el layout
(`app/(app)/app/super-admin/layout.tsx`). Accesible desde Perfil cuando el rol
es `super_admin`.

**Migración:** `supabase/migrations/20260608_super_admin.sql`
- Inserta los **10 temas reales** del design system (`o2`, `carbon`, `rosso`,
  `alpine`, `volt`, `teal`, `stealth`, `papaya`, `titanium`, `midnight`) y dropea
  los 4 placeholders de la migración anterior; reasigna O2 a `o2`.
- Crea el storage bucket **`brand-logos`** (lectura pública; escritura/borrado
  solo `is_super_admin()` vía RLS sobre `storage.objects`).
- Crea **`brand_admin_invite`** (brand_id, email, consumed_at) para asignar
  admins por email antes de que exista la cuenta.

**Capa de datos:**
- `lib/super-admin/queries.ts` — vistas globales con service-role
  (`getGlobalStats`, `listBrandsWithStats`, `getBrandDetail`, `listThemes`,
  `getBrandAdmins`, `getBrandAdminInvites`, `getBrandMetrics`,
  `getBrandRankingTop`). **Solo llamar desde páginas gateadas.**
- `lib/super-admin/actions.ts` — `createBrandAction`, `updateBrandAction`,
  `setBrandStatusAction`, `uploadBrandLogoAction`, `assignBrandAdminAction`,
  `removeBrandAdminAction`, `removeInviteAction`. Todas gatean con
  `isSuperAdmin()` y validan con Zod. El logo valida mime + tamaño (2 MB).

**UI** (`components/features/super-admin/`):
- `BrandForm` (crear/editar: identidad, slug autogenerado, hashtag, logo,
  ThemePicker, admins, estado), `ThemePicker` (grid de swatches), `LogoUploader`,
  `BrandStatusToggle` (activar/desactivar rápido), `BrandAdminsManager`
  (alta por email + lista admins/invites).

**Flujo de alta de marca** (cumple el spec del cliente):
1. Super Admin crea la marca (`/app/super-admin/marcas/nueva`): nombre, slug,
   hashtag, **tema**, **logo**, y emails de **administradores**.
2. El logo se sube al bucket; el tema queda asignado.
3. Cada email: si ya tiene cuenta → se promueve a `brand_admin` al instante
   (fila `brand_admin` + `role`). Si no → invite pendiente.
4. Al registrarse el invitado (`/auth/confirm`), se reconcilia el invite y recibe
   el rol. La carga de logos queda **reservada al Super Admin** (no la hacen los
   brand admins), como pide el requisito.

**Iconos nuevos** en `public/design/icons.svg` + `IconName`: `plus`, `trash`,
`edit`, `image`, `users`, `building`, `palette`, `upload` (24×24, stroke 1.75,
square caps — mismo lenguaje que el sprite).

**Hardening de aislamiento** (`supabase/migrations/20260609_brand_isolation_hardening.sql`,
surgido de una review adversarial multi-agente):
- Moderación (soft-delete) de post/comment scopeada con `is_brand_admin()` — un
  `brand_admin` solo modera SU marca, no todas.
- `WITH CHECK` de `prediction`/`special_prediction` fuerza
  `brand_id = current_brand_id()` (anti-spoof de marca desde el cliente).
- INSERT de `comment` exige que el post sea de la marca del actor (+ check en
  `createComment`).
- SELECT de `comment`/`reaction` scopeado por marca (no más lectura cross-brand
  por query REST directa); `reaction` pasó de `FOR ALL` a DELETE-propias +
  INSERT-en-marca.
- `fn_ranking_for_brand` ordena por puntos (ROW_NUMBER) — correcto aun en marcas
  nuevas sin settle.
- Logos SVG fuera del bucket (anti-XSS de SVG con `<script>`).

## 7. Roadmap pendiente

- **Brand Admin UI** — panel per-marca para `brand_admin` (ver/configurar SU
  marca). El `/app/admin` actual son operaciones de plataforma (resultados,
  logros, soporte) y queda como super-admin. Pendiente el dashboard scopeado.
- **Email real de invitación** — hoy el invite se guarda y reconcilia, pero no se
  envía mail; el super admin comparte el link `/register?brand=<slug>` a mano.
- **Light mode por tema** — los temas hoy son dark-only; light requiere extender
  `themeToCssVars` (los tokens ya soportan `text-inverse` por tema).
- **PWA manifest dinámico** (`app/manifest.ts`) — hoy estático y genérico.
- **Tests automáticos de aislamiento RLS** — manual por ahora.
- **i18n per-brand** — hoy solo placeholders sobre un JSON único.
- **Limpieza de `is_admin`** — el trigger lo sincroniza con `role`; pendiente
  migrar todo callsite a leer `role`.

## 8. Verificación

```bash
# 1. Type check
pnpm typecheck

# 2. Aplicar migraciones (local)
supabase db reset           # corre 20260607 + 20260608 en orden
pnpm supabase:types

# 3. Crear un super admin (SQL directo, una vez):
#    UPDATE "user" SET role = 'super_admin' WHERE email = 'nahuel...';

# 4. Levantar app + flujo Super Admin
pnpm dev
#    - Perfil → "Super Admin · marcas"
#    - Crear marca con tema + logo + emails de admin
#    - Verificar que el logo sube al bucket brand-logos
#    - Registrarse con /register?brand=<slug-nuevo> → branding correcto
#    - Verificar aislamiento: muro/ranking de la marca nueva separados de O2
#    - Share PNG (/api/share/summary/<userId>) con el theme + logo de su marca
```
