/**
 * PRODE.WAZ — Regla de cierre de predicciones (compartida cliente/servidor).
 *
 * Las predicciones cierran 5 MINUTOS antes del kickoff. Esta constante es la
 * única fuente de verdad en TS; el espejo SQL vive en la policy RLS de
 * `prediction` (INTERVAL '5 minutes' — migración 20260615000001_lockout_5min).
 * Si cambia la regla: actualizar acá + nueva migración + schema.sql de
 * referencia, en paralelo.
 */

export const PREDICTION_LOCKOUT_MINUTES = 5;
export const PREDICTION_LOCKOUT_MS = PREDICTION_LOCKOUT_MINUTES * 60 * 1000;

/** Instante (epoch ms) en que cierra la predicción de un partido. */
export function predictionLockTime(kickoffISO: string): number {
  return new Date(kickoffISO).getTime() - PREDICTION_LOCKOUT_MS;
}

/** ¿Ya cerró la predicción para este kickoff? */
export function isPredictionLocked(kickoffISO: string, now: number = Date.now()): boolean {
  return now >= predictionLockTime(kickoffISO);
}
