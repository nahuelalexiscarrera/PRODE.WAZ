/**
 * POST /api/cron/refresh-views — DEPRECATED, no-op.
 *
 * Las materialized views mv_user_summary y mv_ranking_global fueron eliminadas
 * en 20260607_multi_brand.sql y reemplazadas por funciones parametrizadas
 * (fn_user_summary_for_brand, fn_ranking_for_brand). Este endpoint ya no hace
 * nada. Fue removido de vercel.json; se mantiene el archivo para no generar
 * un 404 si algún client lo llama directamente.
 */

import { type NextRequest, NextResponse } from "next/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

const BODY = {
  ok: true,
  deprecated:
    "mv_user_summary y mv_ranking_global fueron eliminadas en la migración multi-marca. Endpoint no-op.",
};

export const GET = (_req: NextRequest) => NextResponse.json(BODY);
export const POST = (_req: NextRequest) => NextResponse.json(BODY);
