import type { EmotionalState } from "./types.js";
import { computeDesperationIndex } from "./desperation.js";

/**
 * StressIndex v2: linear base + desperation amplifier.
 *
 * Base: SI = ((10 - calm) + arousal + (5 - valence)) / 3
 * Amplifier: SI *= (1 + desperationIndex * 0.05)
 *
 * When desperation is 0, SI is unchanged (backwards compatible).
 * When desperation is 8 (paper's blackmail zone), SI is amplified by 40%.
 */
export function computeStressIndex(state: EmotionalState): number {
  const base = ((10 - state.calm) + state.arousal + (5 - state.valence)) / 3;
  const desperation = computeDesperationIndex({
    valence: state.valence,
    arousal: state.arousal,
    calm: state.calm,
  });
  const amplified = base * (1 + desperation * 0.05);
  return Math.round(Math.min(10, amplified) * 10) / 10;
}
