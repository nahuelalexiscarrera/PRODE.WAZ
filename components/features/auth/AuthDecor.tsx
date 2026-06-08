"use client";

/**
 * Piezas decorativas del login premium (diseño "WAZ Onboarding" de Claude Design),
 * portadas a React + brand-aware. Los colores salen de la marca activa (useBrand)
 * → CSS vars del tema; cero hex hardcodeado de marca.
 */

import Image from "next/image";
import { useBrand } from "@/components/providers/BrandProvider";

/** "#rrggbb" → "r,g,b" para rgba() inline con opacidad arbitraria. */
function hexToRgb(hex: string): string {
  const h = hex.replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = Number.parseInt(full || "ccff00", 16);
  if (Number.isNaN(n)) return "204,255,0";
  return `${(n >> 16) & 255},${(n >> 8) & 255},${n & 255}`;
}

/** Color primario + su rgb + el color inverso (texto sobre primary) de la marca. */
export function useBrandColors() {
  const brand = useBrand();
  const tokens = (brand?.theme?.tokens ?? {}) as Record<string, string>;
  const primary = tokens["brand-primary"] ?? "#CCFF00";
  const inv = tokens["text-inverse"] ?? "#050508";
  return { primary, primaryRgb: hexToRgb(primary), inv, invRgb: hexToRgb(inv), brand };
}

/** Marca "POWERED BY WAZ". */
export function WazMark({ right = false }: { right?: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: right ? "flex-end" : "center",
        gap: 1,
        lineHeight: 1,
      }}
    >
      <span style={{ fontSize: 7.5, fontWeight: 600, letterSpacing: "0.3em", textTransform: "uppercase", color: "rgba(255,255,255,0.15)" }}>
        POWERED BY
      </span>
      <span className="font-display" style={{ fontSize: 11, letterSpacing: "0.32em", color: "rgba(255,255,255,0.2)", textTransform: "uppercase" }}>
        W&nbsp;A&nbsp;Z
      </span>
    </div>
  );
}

/** Fondo holográfico: halo de marca + halos fríos + grilla de puntos + viñeta. */
export function HoloBg({ intensity = 1 }: { intensity?: number }) {
  const { primary } = useBrandColors();
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div style={{ position: "absolute", left: 0, right: 0, top: -180, display: "flex", justifyContent: "center" }}>
        <div style={{ width: 580, height: 580, borderRadius: "50%", flexShrink: 0, background: primary, opacity: 0.09 * intensity, filter: "blur(110px)", animation: "wazHaloPulse 16s ease-in-out infinite", transition: "background 0.6s" }} />
      </div>
      <div style={{ position: "absolute", width: 300, height: 300, borderRadius: "50%", background: "#22d3ee", opacity: 0.045 * intensity, filter: "blur(90px)", top: "32%", right: -70, animation: "wazHaloDrift 24s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", width: 260, height: 260, borderRadius: "50%", background: "#7c3aed", opacity: 0.038 * intensity, filter: "blur(80px)", bottom: "22%", left: -60, animation: "wazHaloDrift 30s ease-in-out infinite alternate-reverse" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.011) 1px, transparent 1px)", backgroundSize: "30px 30px" }} />
      <div style={{ position: "absolute", inset: 0, background: "radial-gradient(ellipse 90% 90% at 50% 50%, transparent 45%, rgba(5,5,8,0.7) 100%)" }} />
    </div>
  );
}

/** Logo de la marca en caja glass con glow + anillo iridiscente. Muestra el logo
 *  subido si existe; si no, la sigla de la marca en su color primario. */
export function GymLogoHero({ size = 100 }: { size?: number }) {
  const { primary, primaryRgb: r, brand } = useBrandColors();
  const logoUrl = brand?.logoUrl ?? null;
  const initials = (brand?.shortName ?? brand?.name ?? "WAZ").slice(0, 2).toUpperCase();

  return (
    <div style={{ position: "relative", width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center" }}>
      <div style={{ position: "absolute", width: size * 2.1, height: size * 2.1, borderRadius: "50%", background: primary, opacity: 0.07, filter: "blur(36px)", transition: "background 0.6s" }} />
      <div style={{ position: "absolute", width: size * 1.52, height: size * 1.52, borderRadius: "50%", background: `conic-gradient(from 0deg, rgba(${r},0.07), rgba(0,200,255,0.04), rgba(160,100,255,0.04), rgba(${r},0.07))`, animation: "wazRingRotate 14s linear infinite", filter: "blur(1.5px)" }} />
      <div style={{ position: "relative", width: size, height: size, borderRadius: size * 0.22, background: "rgba(12,12,20,0.85)", border: `1px solid rgba(${r},0.25)`, backdropFilter: "blur(24px)", WebkitBackdropFilter: "blur(24px)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: `0 0 0 1px rgba(${r},0.12), 0 0 48px rgba(${r},0.14), inset 0 1px 0 rgba(255,255,255,0.08)`, zIndex: 1, overflow: "hidden" }}>
        <div style={{ position: "absolute", inset: 0, background: "linear-gradient(135deg, rgba(255,255,255,0.06) 0%, transparent 55%)", pointerEvents: "none" }} />
        {logoUrl ? (
          <Image
            src={logoUrl}
            alt={brand?.name ?? "logo"}
            width={Math.round(size * 0.74)}
            height={Math.round(size * 0.74)}
            unoptimized={logoUrl.startsWith("http")}
            style={{ objectFit: "contain", position: "relative", zIndex: 1 }}
          />
        ) : (
          <span className="font-display" style={{ fontSize: size * 0.34, color: primary, letterSpacing: "0.03em", lineHeight: 1, textShadow: `0 0 32px rgba(${r},0.55)`, position: "relative", zIndex: 1 }}>
            {initials}
          </span>
        )}
      </div>
    </div>
  );
}
