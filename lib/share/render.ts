/**
 * Share render orchestrator — maps data → Satori JSX element.
 * All imports are static so the edge bundler can tree-shake.
 *
 * Multi-marca: cada template recibe `brand: BrandShareContext` con colores,
 * nombre y logo URL. Si el caller no lo pasa, cae al default O2 — útil para
 * dev / preview / shares sin user_id.
 */

import { T01_Summary } from "@/components/share/T01_Summary";
import { T02_Position } from "@/components/share/T02_Position";
import { T03_Match } from "@/components/share/T03_Match";
import { T04_Achievement } from "@/components/share/T04_Achievement";
import {
  DEFAULT_SHARE_BRAND,
  type BrandShareContext,
  type ShareData,
  type ShareFormat,
} from "./templates";
import type { ReactElement } from "react";

export function renderTemplate(
  data: ShareData,
  format: ShareFormat,
  origin = "",
  brand: BrandShareContext = DEFAULT_SHARE_BRAND
): ReactElement {
  switch (data.template) {
    case "summary":
      return T01_Summary({ data, format, brand }) as ReactElement;
    case "position":
      return T02_Position({ data, format, origin, brand }) as ReactElement;
    case "match":
      return T03_Match({ data, format, origin, brand }) as ReactElement;
    case "achievement":
      return T04_Achievement({ data, format, brand }) as ReactElement;
  }
}
