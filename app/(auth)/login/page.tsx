"use client";

/**
 * Login premium — diseño "WAZ Onboarding" (Claude Design) portado a React.
 * Splash #WAZEXPERIENCE (1×/sesión) + fondo holográfico + logo hero + panel glass,
 * todo brand-aware (colores de la marca activa). La LÓGICA de auth se mantiene
 * intacta: <form action={signInAction}>, useFormStatus (pending), estado de error.
 */

import Link from "next/link";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { useFormState, useFormStatus } from "react-dom";
import { signInAction, type ActionResult } from "@/lib/auth/actions";
import { Icon, type IconName } from "@/components/ui/Icon";
import { HoloBg, WazMark, GymLogoHero, useBrandColors } from "@/components/features/auth/AuthDecor";
import { WazSplash } from "@/components/features/auth/WazSplash";
import { GoogleAuthButton } from "@/components/features/auth/GoogleAuthButton";

// ─── Input premium (native, alimenta el form action) ───────────────────
function PInput({
  name,
  type = "text",
  label,
  icon,
  autoComplete,
  error,
  right,
}: {
  name: string;
  type?: string;
  label: string;
  icon?: IconName;
  autoComplete?: string;
  error?: boolean;
  right?: ReactNode;
}) {
  const { primary, primaryRgb: r } = useBrandColors();
  const [focused, setFocused] = useState(false);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      <label
        htmlFor={name}
        style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", textTransform: "uppercase", color: error ? "rgba(239,68,68,0.7)" : "rgba(255,255,255,0.26)" }}
      >
        {label}
      </label>
      <div style={{ position: "relative" }}>
        {icon && (
          <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", color: focused ? primary : "rgba(255,255,255,0.2)", transition: "color 0.2s", display: "flex", zIndex: 1 }}>
            <Icon name={icon} size={16} />
          </div>
        )}
        <input
          id={name}
          name={name}
          type={type}
          required
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={{
            width: "100%",
            height: 56,
            borderRadius: 14,
            background: focused ? `rgba(${r},0.08)` : "rgba(10,10,18,0.9)",
            border: `1px solid ${error ? "rgba(239,68,68,0.5)" : focused ? `rgba(${r},0.5)` : "rgba(255,255,255,0.11)"}`,
            backdropFilter: "blur(20px)",
            WebkitBackdropFilter: "blur(20px)",
            color: "#f5f7fa",
            fontFamily: "inherit",
            paddingLeft: icon ? 44 : 16,
            paddingRight: right ? 50 : 16,
            outline: "none",
            transition: "border-color 0.2s, background 0.2s, box-shadow 0.2s",
            boxShadow: focused ? `0 0 0 3px rgba(${r},0.08), inset 0 1px 0 rgba(255,255,255,0.05)` : "inset 0 1px 0 rgba(255,255,255,0.04)",
          }}
        />
        {right && <div style={{ position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)", zIndex: 1 }}>{right}</div>}
      </div>
    </div>
  );
}

function EyeToggle({ show, onToggle }: { show: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
      style={{ width: 40, height: 40, display: "flex", alignItems: "center", justifyContent: "center", background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.4)" }}
    >
      <Icon name="eye" size={16} />
    </button>
  );
}

// ─── Botón premium con estado pending del form ─────────────────────────
function PSubmit({ children }: { children: ReactNode }) {
  const { pending } = useFormStatus();
  const { primary, primaryRgb: r, inv, invRgb } = useBrandColors();
  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        width: "100%",
        height: 58,
        borderRadius: 9999,
        background: primary,
        color: inv,
        border: "none",
        fontFamily: "var(--font-display)",
        fontSize: 14,
        letterSpacing: "0.14em",
        textTransform: "uppercase",
        cursor: pending ? "not-allowed" : "pointer",
        opacity: pending ? 0.9 : 1,
        transition: "box-shadow 0.2s, opacity 0.2s",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        overflow: "hidden",
        boxShadow: `0 0 0 1px rgba(${r},0.22), 0 8px 30px rgba(${r},0.2)`,
      }}
    >
      <span style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.13) 0%, transparent 52%)", pointerEvents: "none" }} />
      {pending ? (
        <span style={{ width: 20, height: 20, border: `2.5px solid rgba(${invRgb},0.28)`, borderTopColor: inv, borderRadius: "50%", animation: "wazSpin 0.7s linear infinite", display: "inline-block" }} />
      ) : (
        <span style={{ position: "relative", zIndex: 1 }}>{children}</span>
      )}
    </button>
  );
}

// ─── Banner de confirmación (?confirm / ?error) ────────────────────────
function ConfirmBanner() {
  const searchParams = useSearchParams();
  const confirmed = searchParams.get("confirm") === "1";
  const errorConfirm = searchParams.get("error") === "confirm";
  if (!confirmed && !errorConfirm) return null;
  return (
    <div
      style={{ marginBottom: 14, borderRadius: 12, padding: "11px 13px", display: "flex", gap: 10, alignItems: "flex-start", background: "rgba(255,255,255,0.03)", border: `1px solid ${errorConfirm ? "rgba(239,68,68,0.3)" : "rgba(56,189,248,0.3)"}` }}
    >
      <Icon name="info" size={16} className={errorConfirm ? "text-error" : "text-info"} />
      <p style={{ fontSize: 12, color: "rgba(255,255,255,0.7)", lineHeight: 1.5 }}>
        {errorConfirm
          ? "El link de confirmación venció o ya se usó. Entrá con tu contraseña o registrate de nuevo."
          : "Cuenta creada. Revisá tu email para confirmarla y después entrá."}
      </p>
    </div>
  );
}

// ─── Página ────────────────────────────────────────────────────────────
export default function LoginPage() {
  const { primary, primaryRgb, brand } = useBrandColors();
  // Mantener al socio dentro de su marca: los links internos van por path branded.
  const slugPrefix = brand?.slug ? `/${brand.slug}` : "";
  const [showPw, setShowPw] = useState(false);
  const [state, formAction] = useFormState<ActionResult | null, FormData>(signInAction, null);
  const errorField = state && !state.ok ? state.field : undefined;

  // Splash "WAZ Experience" una vez por sesión. Arranca visible (aparece primero,
  // sin flash del login) y se oculta al instante si ya se mostró esta sesión.
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("waz_splash") === "1") setSplashDone(true);
    } catch {
      /* sin sessionStorage → el splash se muestra una vez y completa solo */
    }
  }, []);
  function finishSplash() {
    try {
      sessionStorage.setItem("waz_splash", "1");
    } catch {}
    setSplashDone(true);
  }

  const name = brand?.name ?? "WAZ";
  const tagline = (brand?.subBrand ?? "Prode Mundial 2026").toUpperCase();

  return (
    <>
      {!splashDone && <WazSplash onDone={finishSplash} />}

      <div style={{ minHeight: "100dvh", position: "relative", display: "flex", flexDirection: "column", background: "#050508" }}>
        <HoloBg />

        <div style={{ height: "max(28px, env(safe-area-inset-top))", flexShrink: 0 }} />
        <div style={{ padding: "0 24px", display: "flex", justifyContent: "flex-end", position: "relative", zIndex: 1 }}>
          <WazMark right />
        </div>

        <div style={{ flex: 1, display: "flex", flexDirection: "column", justifyContent: "center", padding: "0 24px", position: "relative", zIndex: 1, gap: 28 }}>
          {/* Identidad del gym — protagonista */}
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", animation: "wazFadeInUp 0.8s cubic-bezier(0,0,0,1) 0.05s both" }}>
            <div style={{ animation: "wazFloat 9s ease-in-out infinite", marginBottom: 18 }}>
              <GymLogoHero size={100} />
            </div>
            <h1 className="font-display" style={{ fontSize: 28, textTransform: "uppercase", color: "#f5f7fa", letterSpacing: "0.02em", lineHeight: 1, marginBottom: 6 }}>
              {name}
            </h1>
            <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.24em", textTransform: "uppercase", color: "rgba(255,255,255,0.22)" }}>
              {tagline}
            </span>
          </div>

          {/* Panel glass */}
          <div style={{ animation: "wazFadeInUp 0.8s cubic-bezier(0,0,0,1) 0.18s both", background: "rgba(16,16,26,0.88)", backdropFilter: "blur(40px) saturate(160%)", WebkitBackdropFilter: "blur(40px) saturate(160%)", border: "1px solid rgba(255,255,255,0.1)", borderRadius: 24, padding: "20px 20px", boxShadow: "0 0 0 0.5px rgba(255,255,255,0.06), 0 24px 60px rgba(0,0,0,0.65), inset 0 1px 0 rgba(255,255,255,0.08)" }}>
            <Suspense fallback={null}>
              <ConfirmBanner />
            </Suspense>

            <GoogleAuthButton />

            <div style={{ display: "flex", alignItems: "center", gap: 12, margin: "16px 0 14px" }}>
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
              <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase", color: "rgba(255,255,255,0.28)" }}>o</span>
              <span style={{ flex: 1, height: 1, background: "rgba(255,255,255,0.1)" }} />
            </div>

            <form action={formAction} noValidate style={{ display: "flex", flexDirection: "column", gap: 13 }}>
              <PInput name="email" type="email" label="Email" icon="mail" autoComplete="email" error={errorField === "email"} />
              <PInput
                name="password"
                type={showPw ? "text" : "password"}
                label="Contraseña"
                icon="lock"
                autoComplete="current-password"
                error={errorField === "password"}
                right={<EyeToggle show={showPw} onToggle={() => setShowPw((v) => !v)} />}
              />
              {state && !state.ok && (
                <p role="alert" style={{ fontSize: 12, color: "rgba(239,68,68,0.85)", paddingLeft: 2 }}>
                  {state.error}
                </p>
              )}
              <div style={{ textAlign: "right", marginTop: -2 }}>
                <Link href={`${slugPrefix}/forgot`} style={{ fontSize: 11, fontWeight: 600, color: `rgba(${primaryRgb},0.7)` }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
              <PSubmit>Ingresar</PSubmit>
            </form>
          </div>

          {/* Footer */}
          <p style={{ textAlign: "center", fontSize: 13, color: "rgba(255,255,255,0.28)", animation: "wazFadeInUp 0.8s cubic-bezier(0,0,0,1) 0.3s both" }}>
            ¿Sos socio nuevo?{" "}
            <Link href={`${slugPrefix}/register`} style={{ color: primary, fontWeight: 700 }}>
              Unite al prode
            </Link>
          </p>
        </div>

        <div style={{ padding: "18px 24px max(24px,env(safe-area-inset-bottom))", display: "flex", justifyContent: "center", position: "relative", zIndex: 1 }}>
          <WazMark />
        </div>
      </div>
    </>
  );
}
