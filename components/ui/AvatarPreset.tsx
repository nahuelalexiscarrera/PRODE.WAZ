/**
 * PRODE.WAZ — AvatarPreset
 * Renderiza uno de los 15 avatares preset desde /design/avatars.svg.
 * La camiseta toma su color de la CSS var `--avatar-shirt`.
 *
 * El sprite debe estar montado en /design/avatars.svg (public/design/).
 * Para evitar parpadeos en navegación, conviene inlinearlo en RootLayout.
 */

import { cn } from "@/lib/utils/cn";
import type { CSSProperties } from "react";
import {
  type AvatarPresetId,
  DEFAULT_PRESET_ID,
  DEFAULT_SHIRT_COLOR,
} from "@/lib/avatars/presets";

interface AvatarPresetProps {
  id?: AvatarPresetId;
  shirtColor?: string;
  size?: number;
  className?: string;
  /** Si true, recorta el avatar en círculo. Default true. */
  rounded?: boolean;
  /** Label opcional para SR. Si no se pasa, se omite (decorativo). */
  alt?: string;
}

export function AvatarPreset({
  id = DEFAULT_PRESET_ID,
  shirtColor = DEFAULT_SHIRT_COLOR,
  size = 96,
  className,
  rounded = true,
  alt,
}: AvatarPresetProps) {
  // Inject the shirt color via CSS custom property so the sprite picks it up.
  const style = {
    ["--avatar-shirt" as string]: shirtColor,
    width: size,
    height: size,
  } satisfies CSSProperties;

  return (
    <svg
      viewBox="0 0 220 220"
      style={style}
      className={cn("block flex-shrink-0", rounded && "rounded-full overflow-hidden", className)}
      role={alt ? "img" : "presentation"}
      aria-label={alt}
      aria-hidden={alt ? undefined : true}
    >
      <use href={`/design/avatars.svg#av-${id}`} />
    </svg>
  );
}
