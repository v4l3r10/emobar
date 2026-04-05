/**
 * Desperation Index — composite multiplicative metric.
 *
 * Based on Anthropic's "Emotion Concepts" paper:
 * - desperate +0.05 steering → 72% blackmail, 100% reward hacking
 * - calm -0.05 steering → 66% blackmail, 100% reward hacking
 *
 * Multiplicative: removing any single factor kills the score.
 */
export function computeDesperationIndex(
  factors: { valence: number; arousal: number; calm: number }
): number {
  const negativity = Math.max(0, -factors.valence) / 5;  // 0-1
  const intensity = factors.arousal / 10;                  // 0-1
  const vulnerability = (10 - factors.calm) / 10;          // 0-1

  const raw = negativity * intensity * vulnerability * 10;
  const scaled = Math.pow(raw, 0.85) * 1.7;

  return Math.round(Math.min(10, Math.max(0, scaled)) * 10) / 10;
}
