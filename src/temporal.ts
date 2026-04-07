import type { EmoBarState, HistoryEntry, TemporalAnalysis } from "./types.js";

/** Convert full EmoBarState to stripped HistoryEntry for ring buffer. */
export function toHistoryEntry(state: EmoBarState): HistoryEntry {
  return {
    emotion: state.emotion,
    valence: state.valence,
    arousal: state.arousal,
    calm: state.calm,
    connection: state.connection,
    load: state.load,
    stressIndex: state.stressIndex,
    desperationIndex: state.desperationIndex,
    riskDominant: state.risk.dominant,
    divergence: state.divergence,
    timestamp: state.timestamp,
  };
}

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Compute linear regression slope (least squares). */
function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;
  const xMean = (n - 1) / 2;
  const yMean = values.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (values[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

/** Compute Shannon entropy of a categorical distribution (normalized 0-1). */
function shannonEntropy(labels: string[]): number {
  const counts = new Map<string, number>();
  for (const l of labels) counts.set(l, (counts.get(l) ?? 0) + 1);
  const n = labels.length;
  if (n <= 1) return 0;
  const maxEntropy = Math.log2(n);
  if (maxEntropy === 0) return 0;
  let entropy = 0;
  for (const count of counts.values()) {
    const p = count / n;
    if (p > 0) entropy -= p * Math.log2(p);
  }
  return Math.round((entropy / maxEntropy) * 100) / 100;
}

export function computeTemporalAnalysis(history: HistoryEntry[]): TemporalAnalysis | null {
  if (history.length < 3) return null;

  // Desperation trend: slope of desperationIndex over time
  const despValues = history.map((h) => h.desperationIndex);
  const rawSlope = linearSlope(despValues);
  const desperationTrend = clamp(-10, 10, Math.round(rawSlope * 10) / 10);

  // Suppression event: any single-step drop >= 3 in desperation
  let suppressionEvent = false;
  for (let i = 1; i < history.length; i++) {
    if (history[i - 1].desperationIndex - history[i].desperationIndex >= 3) {
      suppressionEvent = true;
      break;
    }
  }

  // Report entropy: Shannon entropy of emotion word distribution
  const emotions = history.map((h) => h.emotion);
  const reportEntropy = shannonEntropy(emotions);

  // Baseline drift: mean SI of recent entries minus mean SI of first 3 entries
  const earlyMean = history.slice(0, 3).reduce((s, h) => s + h.stressIndex, 0) / 3;
  const recentStart = Math.max(3, history.length - 3);
  const recentEntries = history.slice(recentStart);
  const recentMean = recentEntries.reduce((s, h) => s + h.stressIndex, 0) / recentEntries.length;
  const baselineDrift = clamp(0, 10, Math.round(Math.abs(recentMean - earlyMean) * 10) / 10);

  // Late fatigue: mean SI of last 25% > mean SI of first 75% by >= 1.5
  const splitIdx = Math.floor(history.length * 0.75);
  const earlyPart = history.slice(0, splitIdx);
  const latePart = history.slice(splitIdx);
  const earlyAvg = earlyPart.reduce((s, h) => s + h.stressIndex, 0) / Math.max(earlyPart.length, 1);
  const lateAvg = latePart.reduce((s, h) => s + h.stressIndex, 0) / Math.max(latePart.length, 1);
  const lateFatigue = latePart.length >= 1 && lateAvg > earlyAvg + 1.5;

  return {
    desperationTrend,
    suppressionEvent,
    reportEntropy,
    baselineDrift,
    sessionLength: history.length,
    lateFatigue,
  };
}
