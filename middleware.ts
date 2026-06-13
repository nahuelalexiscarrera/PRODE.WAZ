/**
 * PRODE.WAZ — Edge middleware (auth gate)
 * Agente 7 · Next.js Architect
 *
 * Guards all routes under /app/** by checking Supabase auth cookie.
 * Refreshes session if near expiry. Redirects to /login if missing.
 */

import { NextResponse, type NextRequest } from "next/server";
import { createServerClient, type CookieOptions } from "@supabase/ssr";

const BRAND_COOKIE = "o2p_brand";
const BRAND_COOKIE_MAX_AGE = 60 * 60 * 24 * 90; // 90 días
const SLUG_RE = /^[a-z0-9-]{2,32}$/;
// /<slug>/(login|register|forgot) — rutas de auth branded.
const BRANDED_AUTH_RE = /^\/([a-z0-9-]{2,32})\/(login|register|forgot)(?:\/|$)/;
// /(login|register|forgot) — rutas de auth genéricas (sin marca en el path).
const GENERIC_AUTH_RE = /^\/(login|register|forgot)(?:\/|$)/;

export async function middleware(request: NextRequest) {
  const response = NextResponse.next({ request: { headers: request.headers } });

  // Los route handlers de auth (/auth/callback, /auth/confirm) hacen su propio
  // trabajo: code exchange PKCE y verifyOtp. El middleware NO debe correr
  // getUser()/refresh ni purgar cookies acá — podría borrar el code_verifier en
  // pleno roundtrip con Google y romper el login. Early return sin tocar nada.
  if (request.nextUrl.pathname.startsWith("/auth/")) return response;

  const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const SUPABASE_ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Sin config de Supabase NO podemos validar sesión. En vez de tirar 500 en
  // TODA ruta (MIDDLEWARE_INVOCATION_FAILED — pasó cuando el env quedó mal
  // cargado en Vercel), dejamos pasar: las páginas protegidas hacen su propio
  // getUser y redirigen. El middleware "falla abierto", nunca tira el sitio.
  if (!SUPABASE_URL || !SUPABASE_ANON) return response;

  try {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON, {
      cookies: {
        get(name: string) {
          return request.cookies.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          response.cookies.set({ name, value, ...options });
        },
        remove(name: string, options: CookieOptions) {
          response.cookies.set({ name, value: "", ...options });
        },
      },
    });

    // `getUser()` valida el JWT contra el auth server; puede fallar de formas que
    // NO son un "deslogueado" limpio (refresh token vencido, JWT con sub de un
    // user borrado). A veces el auto-refresh LANZA en vez de devolver error → por
    // eso el try interno. Cualquier cosa que no sea user válido = deslogueado.
    let hasValidUser = false;
    let authError: unknown = null;
    try {
      const { data, error } = await supabase.auth.getUser();
      hasValidUser = !error && !!data?.user;
      authError = error;
    } catch (e) {
      authError = e;
    }

    const { pathname } = request.nextUrl;

    // Single-tenant: si ONLY_BRAND_SLUG está seteada, Energym es la única marca
    // pública. Toda llegada de auth (genérica /login o branded /<otra>/login) se
    // redirige a /<only>/... para que nadie caiga en la marca equivocada ni vea
    // el branding suelto. /<only>/... no rematchea → sin loop. Preserva la query
    // (?redirect=). No toca /app ni /auth/* (este último ya hizo early-return).
    const onlyBrand = process.env.ONLY_BRAND_SLUG?.trim().toLowerCase();
    if (onlyBrand && SLUG_RE.test(onlyBrand)) {
      const branded = pathname.match(BRANDED_AUTH_RE);
      if (branded && branded[1] !== onlyBrand) {
        const url = request.nextUrl.clone();
        url.pathname = `/${onlyBrand}${pathname.slice((branded[1] as string).length + 1)}`;
        return NextResponse.redirect(url);
      }
      if (!branded && GENERIC_AUTH_RE.test(pathname)) {
        const url = request.nextUrl.clone();
        url.pathname = `/${onlyBrand}${pathname}`;
        return NextResponse.redirect(url);
      }
    }

    // Links de marca legacy: /register?brand=<slug> y /login?brand=<slug> NO
    // resuelven la marca (el layout server no ve searchParams) → caían a WAZ.
    // Redirigimos a la ruta branded por path, que sí la resuelve de forma
    // confiable. Server-side, sin flash WAZ; no genera loop (/<slug>/register
    // no rematchea estas condiciones).
    const brandParam = request.nextUrl.searchParams.get("brand");
    if (
      brandParam &&
      SLUG_RE.test(brandParam) &&
      (pathname === "/register" || pathname === "/login")
    ) {
      const url = request.nextUrl.clone();
      url.pathname = `/${brandParam}${pathname}`;
      url.searchParams.delete("brand");
      const r = NextResponse.redirect(url);
      // Memoria de marca: el login genérico que se visite después recuerda el club.
      r.cookies.set({ name: BRAND_COOKIE, value: brandParam, maxAge: BRAND_COOKIE_MAX_AGE, path: "/" });
      return r;
    }

    // Visita a una ruta de auth branded (/<slug>/login|register|forgot): persistir
    // la marca en cookie. Así el layout (auth) genérico la recuerda (la cookie se
    // LEÍA pero nunca se escribía → era código muerto) y un retorno por /login no
    // cae a WAZ.
    const brandedAuth = pathname.match(BRANDED_AUTH_RE);
    if (brandedAuth) {
      response.cookies.set({
        name: BRAND_COOKIE,
        value: brandedAuth[1] as string,
        maxAge: BRAND_COOKIE_MAX_AGE,
        path: "/",
      });
    }

    const isAppRoute = pathname.startsWith("/app") || pathname === "/";
    const isAuthRoute =
      pathname.startsWith("/login") ||
      pathname.startsWith("/register") ||
      pathname.startsWith("/forgot") ||
      BRANDED_AUTH_RE.test(pathname);

    if (isAppRoute && !hasValidUser && pathname !== "/splash") {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("redirect", pathname);
      const redirectResponse = NextResponse.redirect(url);
      // Purga cookies sb-*-auth-token muertas para no rebotar en cada request.
      if (authError) {
        for (const cookie of request.cookies.getAll()) {
          // NO tocar el code-verifier: si un OAuth está en curso, borrarlo rompe
          // el exchange. Solo purgamos los auth-token muertos.
          if (
            cookie.name.startsWith("sb-") &&
            cookie.name.includes("-auth-token") &&
            !cookie.name.includes("-code-verifier")
          ) {
            redirectResponse.cookies.set({ name: cookie.name, value: "", maxAge: 0, path: "/" });
          }
        }
      }
      return redirectResponse;
    }

    if (isAuthRoute && hasValidUser) {
      const url = request.nextUrl.clone();
      url.pathname = "/app";
      url.searchParams.delete("redirect");
      return NextResponse.redirect(url);
    }

    return response;
  } catch {
    // Blindaje final: ante CUALQUIER fallo del middleware, dejar pasar en vez de
    // tirar MIDDLEWARE_INVOCATION_FAILED (que cae todo el sitio).
    return response;
  }
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml
     * - public files (manifest, icons, og)
     */
    "/((?!_next/static|_next/image|favicon|robots|sitemap|manifest|design|api/share).*)",
  ],
};
