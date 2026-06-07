import {
  DEFAULT_SHARE_BRAND,
  type BrandShareContext,
  type SummaryShareData,
  type ShareFormat,
} from "@/lib/share/templates";

const STATIC = {
  bg: "#0a0608",
  gold: "#FFB300",
  celeste: "#74ACDF",
  muted: "#888888",
  text: "#FFFFFF",
};

export function T01_Summary({
  data,
  format,
  brand = DEFAULT_SHARE_BRAND,
}: {
  data: SummaryShareData;
  format: ShareFormat;
  brand?: BrandShareContext;
}) {
  const C = {
    ...STATIC,
    primary: brand.primary,
    lime: brand.accent,
  };
  const h = format === "story" ? 1920 : 1080;
  const accent = data.isArgentinaChampion ? C.celeste : C.gold;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width: 1080,
        height: h,
        background: `linear-gradient(160deg, ${C.bg} 0%, #1a1410 60%, #050307 100%)`,
        fontFamily: "Inter",
        padding: 0,
        position: "relative",
      }}
    >
      {/* Atmosphere glow */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          right: 0,
          width: 700,
          height: 700,
          borderRadius: "50%",
          background: `radial-gradient(ellipse at center, rgba(${brand.primaryRGB},0.18) 0%, transparent 70%)`,
          display: "flex",
        }}
      />

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          flex: 1,
          padding: "80px 80px 72px",
        }}
      >
        {/* Top bar */}
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 64,
          }}
        >
          <span style={{ fontSize: 28, letterSpacing: "0.2em", color: C.muted, fontWeight: 700 }}>
            — MI PRODE
          </span>
          <span
            style={{
              fontSize: 64,
              fontFamily: "Anton",
              color: C.primary,
              letterSpacing: "0.04em",
              textShadow: `0 0 32px rgba(${brand.primaryRGB},0.6)`,
            }}
          >
            {brand.name}
          </span>
        </div>

        {/* Title */}
        <div style={{ display: "flex", flexDirection: "column", marginBottom: 56 }}>
          <span
            style={{
              fontFamily: "Anton",
              fontSize: format === "story" ? 160 : 120,
              lineHeight: 1,
              color: C.text,
              letterSpacing: "-0.01em",
            }}
          >
            MUNDIAL
          </span>
          <span
            style={{
              fontFamily: "Anton",
              fontSize: format === "story" ? 96 : 80,
              color: C.primary,
              letterSpacing: "0.16em",
              marginTop: 8,
            }}
          >
            2 0 2 6
          </span>
        </div>

        {/* Data rows */}
        <div style={{ display: "flex", flexDirection: "column", gap: 32, flex: 1 }}>
          <DataRow label="CAMPEÓN" value={data.champion.country.toUpperCase()} accent={accent} />
          <DataRow label="MI POSICIÓN" value={`#${data.position}`} accent={C.primary} />

          {/* Divider */}
          <div
            style={{
              height: 1,
              background: `linear-gradient(90deg, transparent 0%, ${C.gold} 50%, transparent 100%)`,
              display: "flex",
            }}
          />

          {/* Stats */}
          <div style={{ display: "flex", gap: 48 }}>
            <StatBlock
              label="PUNTOS"
              value={String(data.points)}
              accent={C.lime}
              glow={`0 0 48px rgba(${brand.primaryRGB},0.4)`}
            />
            <StatBlock label="NIVEL" value={data.userLevelName.toUpperCase()} accent={C.text} large={false} />
          </div>
        </div>

        {/* Footer */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 48 }}>
          <span style={{ fontSize: 28, letterSpacing: "0.14em", color: C.gold, fontWeight: 700 }}>
            {`#PRODEMUNDIAL${brand.hashtagSuffix}`}
          </span>
          <span style={{ fontSize: 28, color: C.muted }}>— {data.userName.split(" ")[0]}</span>
        </div>
      </div>
    </div>
  );
}

function DataRow({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span style={{ fontSize: 22, letterSpacing: "0.2em", color: "#888888", fontWeight: 700 }}>
        — {label}
      </span>
      <span style={{ fontFamily: "Anton", fontSize: 64, color: accent, lineHeight: 1 }}>
        {value}
      </span>
    </div>
  );
}

function StatBlock({
  label,
  value,
  accent,
  large = true,
  glow,
}: {
  label: string;
  value: string;
  accent: string;
  large?: boolean;
  glow?: string;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <span style={{ fontSize: 22, letterSpacing: "0.2em", color: "#888888", fontWeight: 700 }}>
        {label}
      </span>
      <span
        style={{
          fontFamily: "Anton",
          fontSize: large ? 120 : 64,
          color: accent,
          lineHeight: 1,
          textShadow: glow,
        }}
      >
        {value}
      </span>
    </div>
  );
}
