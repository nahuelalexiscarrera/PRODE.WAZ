/**
 * PRODE.WAZ — Cron: sync-results (football-data.org)
 *
 * GET/POST /api/cron/sync-results · Bearer CRON_SECRET
 *
 * Capa fina de auth: la lógica vive en lib/football-api/sync.ts (runFixtureSync),
 * compartida con la acción manual del panel de admin ("Sincronizar fixture").
 */

import { type NextRequest, NextResponse } from "next/server";
import { runFixtureSync } from "@/lib/football-api/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authOk(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return req.headers.get("authorization") === `Bearer ${secret}`;
}

async function handle(req: NextRequest) {
  if (!authOk(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    return NextResponse.json(await runFixtureSync());
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
