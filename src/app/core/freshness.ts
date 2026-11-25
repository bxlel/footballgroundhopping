/** Au-delà de cette ancienneté, on prévient que les horaires ont pu changer. */
export const STALE_AFTER_HOURS = 24;

/**
 * Ancienneté des données en heures entières, ou `null` si elles sont fraîches
 * (ou si la date de synchronisation est inconnue : on ne prévient pas à tort).
 */
export function staleHours(syncedAt: string | null, now: Date = new Date()): number | null {
  if (!syncedAt) return null;
  const synced = Date.parse(syncedAt);
  if (Number.isNaN(synced)) return null;
  const hours = Math.floor((now.getTime() - synced) / 3_600_000);
  return hours >= STALE_AFTER_HOURS ? hours : null;
}
