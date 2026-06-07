"use client";

import { Icon } from "@/components/ui/Icon";
import type { ThemeOption } from "@/lib/super-admin/queries";
import { cn } from "@/lib/utils/cn";

/**
 * Grid de swatches de tema. Cada swatch muestra el color primario como fondo,
 * un punto de accent, y el nombre. El seleccionado se marca con borde primary
 * + check. Controlado: el padre maneja `value` y `onChange`.
 */
export function ThemePicker({
  themes,
  value,
  onChange,
}: {
  themes: ThemeOption[];
  value: string;
  onChange: (slug: string) => void;
}) {
  return (
    <div role="radiogroup" aria-label="Tema visual" className="grid grid-cols-2 gap-3">
      {themes.map((t) => {
        const primary = t.tokens["brand-primary"] ?? "#ccff00";
        const accent = t.tokens["accent-lime"] ?? "#ffffff";
        const selected = t.slug === value;
        return (
          <button
            key={t.slug}
            type="button"
            // biome-ignore lint/a11y/useSemanticElements: radio-group custom sobre botones (cada opción es un swatch visual, no un input nativo)
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(t.slug)}
            className={cn(
              "relative flex flex-col gap-2 rounded-xl border p-3 text-left transition-colors",
              selected
                ? "border-primary bg-primary-bg"
                : "border-border bg-card hover:border-border-strong"
            )}
          >
            {/* Swatch */}
            <div
              className="h-12 rounded-lg flex items-end justify-start p-2 overflow-hidden"
              style={{ background: primary }}
            >
              <span
                className="w-4 h-4 rounded-full border border-black/20"
                style={{ background: accent }}
                aria-hidden="true"
              />
            </div>
            <span className="text-body-sm text-text font-medium leading-tight">{t.name}</span>
            {selected && (
              <span className="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center">
                <Icon name="check" size={13} className="text-text-inverse" />
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
