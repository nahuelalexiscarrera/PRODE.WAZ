"use client";

/**
 * Splash "WAZ Experience" — momento de marca al entrar al login.
 * #WAZEXPERIENCE con reveal letra-a-letra + shimmer + línea, ~2.5s, fade out.
 * Diseño: Claude Design "WAZ Onboarding". Respeta prefers-reduced-motion (los
 * keyframes se neutralizan vía la regla global de globals.css → muestra el
 * estado final al instante).
 */

import { useEffect, useState } from "react";

const PHRASE = "#WAZEXPERIENCE".split("");

export function WazSplash({ onDone }: { onDone: () => void }) {
  const [out, setOut] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setOut(true), 2000);
    const t2 = setTimeout(onDone, 2550);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, [onDone]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 200,
        background: "#050508",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexDirection: "column",
        gap: 22,
        opacity: out ? 0 : 1,
        transition: out ? "opacity 0.55s cubic-bezier(0.4,0,1,1)" : "none",
        pointerEvents: out ? "none" : "auto",
      }}
    >
      {/* Halos */}
      <div style={{ position: "absolute", left: "50%", top: "50%", transform: "translate(-50%,-52%)", width: 360, height: 360, borderRadius: "50%", background: "rgba(255,255,255,0.025)", filter: "blur(90px)", animation: "wazHaloPulse 8s ease-in-out infinite" }} />
      <div style={{ position: "absolute", width: 180, height: 180, borderRadius: "50%", background: "#7c3aed", opacity: 0.04, filter: "blur(60px)", top: "25%", left: "12%", animation: "wazHaloDrift 12s ease-in-out infinite alternate" }} />
      <div style={{ position: "absolute", width: 160, height: 160, borderRadius: "50%", background: "#06b6d4", opacity: 0.03, filter: "blur(55px)", top: "38%", right: "8%", animation: "wazHaloDrift 16s ease-in-out infinite alternate-reverse" }} />
      <div style={{ position: "absolute", inset: 0, backgroundImage: "radial-gradient(rgba(255,255,255,0.01) 1px, transparent 1px)", backgroundSize: "28px 28px" }} />

      {/* Texto */}
      <div style={{ position: "relative", zIndex: 1, overflow: "hidden" }}>
        <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center" }}>
          {PHRASE.map((ch, i) => (
            <span
              // biome-ignore lint/suspicious/noArrayIndexKey: frase estática, nunca se reordena
              key={i}
              className="font-display"
              style={{ fontSize: "clamp(24px,6.8vw,42px)", color: "#ffffff", letterSpacing: "0.07em", lineHeight: 1, display: "inline-block", animation: `wazCharReveal 0.48s cubic-bezier(0,0,0,1) ${0.18 + i * 0.042}s both` }}
            >
              {ch}
            </span>
          ))}
        </div>
        <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none" }}>
          <div style={{ position: "absolute", top: 0, bottom: 0, width: "32%", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.12), transparent)", animation: "wazShimmerPass 0.65s ease-in 1.1s forwards", transform: "translateX(-120%)" }} />
        </div>
      </div>

      {/* Línea decorativa */}
      <div style={{ position: "relative", zIndex: 1, width: 44, height: 1, transformOrigin: "left", animation: "wazLineDraw 0.5s cubic-bezier(0,0,0,1) 0.85s both", background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.3), transparent)" }} />
    </div>
  );
}
