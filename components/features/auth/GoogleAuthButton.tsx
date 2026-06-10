"use client";

/**
 * Botón "Continuar con Google" — ingreso rápido OAuth, brand-aware.
 *
 * El slug de la marca activa (useBrand) viaja en el redirect (?brand=) para que
 * el callback (/auth/callback) ancle al usuario en la marca correcta — Google NO
 * llena nuestro brandSlug en user_metadata. Solo se usa en la pantalla de login.
 *
 * La "G" de Google es el SVG de marca oficial (asset de tercero, no iconografía
 * del sprite): única excepción justificada a la regla de íconos custom.
 */

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useBrand } from "@/components/providers/BrandProvider";

function GoogleG() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden="true" focusable="false">
      <path
        fill="#4285F4"
        d="M17.64 9.2045c0-.6381-.0573-1.2518-.1636-1.8409H9v3.4814h4.8436c-.2086 1.125-.8427 2.0782-1.7959 2.7164v2.2581h2.9087c1.7018-1.5668 2.6836-3.874 2.6836-6.615z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.4673-.806 5.9564-2.1804l-2.9087-2.2581c-.8059.54-1.8368.8591-3.0477.8591-2.344 0-4.3282-1.5831-5.036-3.7104H.9573v2.3318C2.4382 15.9832 5.4818 18 9 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.964 10.71c-.18-.54-.2823-1.1168-.2823-1.71s.1023-1.17.2823-1.71V4.9582H.9573C.3477 6.1732 0 7.5477 0 9s.3477 2.8268.9573 4.0418L3.964 10.71z"
      />
      <path
        fill="#EA4335"
        d="M9 3.5795c1.3214 0 2.5077.4541 3.4405 1.346l2.5813-2.5814C13.4632.8918 11.426 0 9 0 5.4818 0 2.4382 2.0168.9573 4.9582L3.964 7.29C4.6718 5.1627 6.656 3.5795 9 3.5795z"
      />
    </svg>
  );
}

export function GoogleAuthButton({ label = "Continuar con Google" }: { label?: string }) {
  const brand = useBrand();
  const [loading, setLoading] = useState(false);

  async function go() {
    setLoading(true);
    try {
      // SIEMPRE el origin actual: OAuth debe volver al mismo host donde está el
      // usuario (localhost, preview de Vercel o producción). NEXT_PUBLIC_APP_URL
      // apuntaría a producción y rompería el flujo en los otros entornos.
      const base = window.location.origin;
      const slug = brand?.slug ? `&brand=${encodeURIComponent(brand.slug)}` : "";
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${base}/auth/callback?next=/app${slug}`,
          queryParams: { prompt: "select_account" },
        },
      });
      // Si arrancó bien, el browser ya está navegando a Google. Solo re-habilitamos
      // en caso de error (el redirect no llegó a ocurrir).
      if (error) setLoading(false);
    } catch {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={go}
      disabled={loading}
      aria-label={label}
      style={{
        width: "100%",
        height: 54,
        borderRadius: 9999,
        background: "#ffffff",
        color: "#1f1f1f",
        border: "none",
        fontFamily: "inherit",
        fontSize: 14,
        fontWeight: 600,
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.85 : 1,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 10,
        transition: "opacity 0.2s, box-shadow 0.2s",
        boxShadow: "0 4px 18px rgba(0,0,0,0.28), inset 0 0 0 1px rgba(0,0,0,0.04)",
      }}
    >
      {loading ? (
        <span
          style={{
            width: 18,
            height: 18,
            border: "2.5px solid rgba(31,31,31,0.25)",
            borderTopColor: "#1f1f1f",
            borderRadius: "50%",
            animation: "wazSpin 0.7s linear infinite",
            display: "inline-block",
          }}
        />
      ) : (
        <>
          <GoogleG />
          <span>{label}</span>
        </>
      )}
    </button>
  );
}
