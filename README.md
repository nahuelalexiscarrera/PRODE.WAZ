# PRODE.WAZ

Plataforma web mobile-first **multi-marca** para que comunidades (gimnasios, clubs,
empresas) hosteen su propio prode del **Mundial 2026**. Cada marca tiene sus
usuarios, ranking, branding y configuración aislados, sobre una única
infraestructura (mismo código, misma Supabase, mismo Vercel).

Nació como app de un solo gimnasio (**O2 Wellness Club**) y se evolucionó a
plataforma. O2 es hoy la marca semilla / tenant original.

> Arquitectura multi-marca: ver [`docs/16_multi_brand.md`](docs/16_multi_brand.md).
> Constitución del repo: [`CLAUDE.md`](CLAUDE.md).

---

## Quick start

```bash
pnpm install
cp .env.example .env.local
# editar .env.local con credenciales de Supabase (proyecto propio)
pnpm dev
```

App corre en `http://localhost:3000`.

Para correr la base con las tablas multi-marca:

```bash
supabase start                 # DB local (Docker)
supabase db reset              # aplica todas las migraciones en orden
pnpm supabase:types            # regenera types/database.ts
# crear un super admin (una vez):
#   UPDATE "user" SET role = 'super_admin' WHERE email = 'tu@email';
```

---

## Stack

- **Next.js 15** App Router + **TypeScript** strict (`noUncheckedIndexedAccess`)
- **Tailwind CSS** con design tokens propios (theming por marca vía CSS vars)
- **React 18** + **Framer Motion 11**
- **Supabase** — auth + DB + Realtime + Storage (multi-tenant, RLS por marca)
- **@vercel/og** — share PNG server-side (brand-aware)
- **Zod** — validación de input en server actions
- **Vitest** unit + **Playwright** e2e
- **Biome** lint + format
- **pnpm** package manager

---

## Comandos

```bash
pnpm dev              # Dev server con Turbopack
pnpm build            # Production build
pnpm start            # Run production build
pnpm typecheck        # tsc --noEmit
pnpm lint             # Biome lint
pnpm format           # Biome format
pnpm test             # Vitest (unit + component)
pnpm test:e2e         # Playwright (requiere dev server corriendo)
pnpm supabase:types   # Regenera types/database.ts desde la DB
```

---

## Estructura del repo

```
app/                  Next.js App Router
  (auth)/             Login, register (lee ?brand=<slug>), forgot, reset
  (app)/              Home, Prode, Ranking, Muro, Perfil
    app/super-admin/  Panel Super Admin (marcas, temas, admins, stats globales)
    app/admin/        Operaciones de plataforma (resultados, logros, soporte)
  api/                Edge handlers (share brand-aware, predictions, crons)
components/
  ui/                 Primitivas (Button, Avatar, Switch, Icon, Flag…)
  features/           Compuestos (MatchCard, RankingRow, ScreenHeader…)
    super-admin/      BrandForm, ThemePicker, BrandAdminsManager…
  share/              Templates de share card (Satori JSX, brand-aware)
  providers/          BrandProvider (useBrand) — contexto de marca activa
lib/
  brands/             queries (getCurrentBrand, isSuperAdmin) + theme (CSS vars)
  super-admin/        queries + actions del panel
  supabase/           Clients (browser, server, admin)
  scoring/            Engine de puntos (paridad con fn_calculate_points)
  ranking/            Cómputo de ranking (por marca)
  achievements/       Catálogo + triggers + niveles
  social/             Queries, actions, realtime del muro (por marca)
  share/              Pipeline server-side de share PNG
  i18n/               es-AR.json (placeholders {brandName}) + resolve.ts
types/
  domain.ts           Tipos de dominio (Brand, Theme, User…)
  database.ts         Auto-generado de Supabase
supabase/
  schema.sql          DDL de referencia
  migrations/         Migraciones (multi-brand, super-admin, hardening)
design/               Mockups HTML + sprite SVG fuente + tokens.json
docs/                 Documentación arquitectónica (01-16 + extras)
```

---

## Multi-marca en 30 segundos

- **Plataforma** = PRODE.WAZ. **Marcas** = tenants (O2, FitClub, …) que viven en
  la tabla `brand`.
- Un usuario pertenece a **una** marca (`user.brand_id`), asignada al registrarse
  vía link de invitación `/register?brand=<slug>`.
- El **branding** (logo, colores, hashtag, copy) sale de la marca activa: server
  components usan `getCurrentBrand()`, client components `useBrand()`. Cero strings
  de marca hardcodeados.
- **Roles:** `member` · `brand_admin` (admin de su marca) · `super_admin` (owner
  de la plataforma; crea marcas, sube logos, asigna admins desde `/app/super-admin`).
- **Aislamiento:** RLS por marca en toda la data de usuario; el torneo (partidos,
  equipos) es compartido.

---

## Reglas innegociables (resumen)

- **Cero emojis Unicode.** Iconografía custom desde `public/design/icons.svg`.
- **Branding por marca activa.** Nada de "O2" hardcodeado — todo vía `useBrand()` /
  `getCurrentBrand()` o placeholders en `lib/i18n/es-AR.json`.
- **es-AR rioplatense.** Voseo siempre. Todo copy en `lib/i18n/es-AR.json`.
- **Mobile-first PWA.** Container max-width 480px en todos los breakpoints.
- **Dark mode** (light por tema queda pendiente).
- **Registro abierto** (email + teléfono opcional). El padrón cerrado por invite se
  conserva en código pero no está en el flujo.
- **Sin dinero ni apuestas.** Premios simbólicos definidos por cada marca.
- **WCAG 2.1 AA** mínimo.

Ver [`CLAUDE.md`](CLAUDE.md) para la constitución completa.

---

## Deploy

Plataforma: **Vercel** (Next.js detectado automático). Resumido:

1. Repo en GitHub (propio de PRODE.WAZ).
2. Importar en Vercel → New Project.
3. Variables de entorno (Supabase URL + keys, VAPID, CRON_SECRET, etc.).
4. Aplicar migraciones a la Supabase del proyecto y crear el primer `super_admin`.
5. Actualizar **Site URL** + **Redirect URLs** en Supabase con el dominio de Vercel.

Checklist completo en [`docs/DEPLOY_CHECKLIST.md`](docs/DEPLOY_CHECKLIST.md).

---

*Mundial 2026 · KaiStudio*
