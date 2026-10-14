/** Converts recorder metering (dBFS, about -60..0) to 0..1. */
export function meteringToLevel(db: number | undefined): number {
  if (db === undefined || !Number.isFinite(db)) return 0.15;
  return Math.min(1, Math.max(0, (db + 55) / 50));
}
