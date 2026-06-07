/**
 * PRODE.WAZ — Preset avatars (Discord-style)
 * 15 avatares pre-diseñados que el socio puede elegir como foto de perfil,
 * más una paleta de 8 colores para la camiseta.
 *
 * Sprite vive en /public/design/avatars.svg con `<symbol id="av-<id>"/>` por avatar.
 * Encoding en DB: avatar_url = "preset:<id>:<hex>"  ej. "preset:06-afro:D9FF3F"
 */

export type PresetCategory = "person" | "animal";

export interface AvatarPreset {
  id: string;
  label: string;
  category: PresetCategory;
}

export const AVATAR_PRESETS: AvatarPreset[] = [
  { id: "01-barbudo", label: "Barbudo", category: "person" },
  { id: "02-canoso", label: "Canoso", category: "person" },
  { id: "03-gorra", label: "Con gorra", category: "person" },
  { id: "04-anteojos", label: "Con anteojos", category: "person" },
  { id: "05-pelolargo", label: "Pelo largo", category: "person" },
  { id: "06-afro", label: "Pelo afro", category: "person" },
  { id: "07-pixie", label: "Pixie cut", category: "person" },
  { id: "08-pelirroja", label: "Pelirroja", category: "person" },
  { id: "09-lila", label: "Pelo lila", category: "person" },
  { id: "10-rapado", label: "Rapado", category: "person" },
  { id: "11-neon", label: "Pelo neon", category: "person" },
  { id: "12-perro", label: "Perro", category: "animal" },
  { id: "13-gato", label: "Gato", category: "animal" },
  { id: "14-tigre", label: "Tigre", category: "animal" },
  { id: "15-oso", label: "Oso", category: "animal" },
];

export const AVATAR_PRESET_IDS = AVATAR_PRESETS.map((p) => p.id);
export type AvatarPresetId = (typeof AVATAR_PRESETS)[number]["id"];

export interface ShirtColor {
  hex: string;
  label: string;
}

export const SHIRT_COLORS: ShirtColor[] = [
  { hex: "#D9FF3F", label: "Lima" },
  { hex: "#FF6A00", label: "Naranja" },
  { hex: "#F5F7FA", label: "Blanco" },
  { hex: "#1F1A18", label: "Negro" },
  { hex: "#75AADB", label: "Celeste" },
  { hex: "#C73A2C", label: "Rojo" },
  { hex: "#B07AFF", label: "Violeta" },
  { hex: "#22C55E", label: "Verde" },
];

export const DEFAULT_SHIRT_COLOR = SHIRT_COLORS[0]!.hex;
export const DEFAULT_PRESET_ID = AVATAR_PRESETS[0]!.id;

// Encoding helpers ──────────────────────────────────────────────────────

const PREFIX = "preset:";

export function encodePreset(id: AvatarPresetId, shirtHex: string): string {
  // shirtHex puede venir con # o sin
  const clean = shirtHex.startsWith("#") ? shirtHex.slice(1) : shirtHex;
  return `${PREFIX}${id}:${clean.toUpperCase()}`;
}

export interface DecodedPreset {
  id: AvatarPresetId;
  shirtHex: string;
}

export function decodePreset(value: string | null | undefined): DecodedPreset | null {
  if (!value || !value.startsWith(PREFIX)) return null;
  const [, body] = value.split(PREFIX);
  if (!body) return null;
  const [id, hex] = body.split(":");
  if (!id || !hex) return null;
  if (!AVATAR_PRESET_IDS.includes(id)) return null;
  return { id, shirtHex: `#${hex}` };
}

export function isPresetUrl(value: string | null | undefined): boolean {
  return !!value && value.startsWith(PREFIX);
}
