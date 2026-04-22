export const BACKOFF_SECONDS = [30, 120, 480, 1800, 7200]

export function nextRetryDelay(attemptCount: number): number {
  const idx = Math.min(attemptCount, BACKOFF_SECONDS.length - 1)
  return BACKOFF_SECONDS[idx]
}
