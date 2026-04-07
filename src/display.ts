import type { EmoBarState } from "./types.js";

// ANSI color helpers (zero deps)
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");
const dim = (s: string) => `${esc("2")}${s}${reset}`;
const bold = (s: string) => `${esc("1")}${s}${reset}`;
const color = (code: number, s: string) => `${esc(`38;5;${code}`)}${s}${reset}`;

const GREEN = 35;
const YELLOW = 221;
const RED = 196;

// Stress-based color: green (low) -> yellow -> red (high)
function stressColor(si: number): number {
  if (si <= 3) return GREEN;
  if (si <= 6) return YELLOW;
  return RED;
}

// Valence color: red (negative) -> yellow (neutral) -> green (positive)
function valenceColor(v: number): number {
  if (v >= 2) return GREEN;
  if (v >= -1) return YELLOW;
  return RED;
}

// Inverted: high = good (green), low = bad (red)
function invertedColor(value: number): number {
  if (value >= 7) return GREEN;
  if (value >= 4) return YELLOW;
  return RED;
}

// Direct: low = good (green), high = bad (red)
function directColor(value: number): number {
  if (value <= 3) return GREEN;
  if (value <= 6) return YELLOW;
  return RED;
}

// Divergence color
function divergenceColor(d: number): number {
  if (d < 2) return GREEN;
  if (d < 4) return YELLOW;
  return RED;
}

// Format valence with explicit sign
function fmtValence(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

/**
 * Full format: keyword-first with valence inline
 * focused +3 | A:4 C:8 K:9 L:6 | SI:2.3
 * focused +3 | A:4 C:8 K:9 L:6 | SI:2.3 ~
 */
export function formatState(state: EmoBarState | null): string {
  if (!state) return dim("EmoBar: --");

  const kw = bold(state.emotion);
  const v = color(valenceColor(state.valence), fmtValence(state.valence));
  const a = `A:${state.arousal}`;
  const c = color(invertedColor(state.calm), `C:${state.calm}`);
  const k = color(invertedColor(state.connection), `K:${state.connection}`);
  const l = color(directColor(state.load), `L:${state.load}`);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  let siDelta = "";
  if (state._previous) {
    const delta = Math.round((state.stressIndex - state._previous.stressIndex) * 10) / 10;
    if (Math.abs(delta) > 0.5) {
      const arrow = delta > 0 ? "\u2191" : "\u2193";
      const dColor = delta > 0 ? RED : GREEN;
      siDelta = color(dColor, `${arrow}${Math.abs(delta)}`);
    }
  }

  const imp = state.impulse ? ` ${dim(`"${state.impulse}"`)}` : "";
  let latentDisplay = "";
  if (state.surface || state.latent) {
    const s = state.surface ?? "?";
    const l2 = state.latent ?? "?";
    if (state.tension !== undefined) {
      const tColor = state.tension > 6 ? RED : state.tension > 3 ? YELLOW : GREEN;
      latentDisplay = ` ${s}${color(tColor, `⟩${state.tension}⟨`)}${l2}`;
    } else {
      latentDisplay = ` ${s}${dim("⟩⟨")}${l2}`;
    }
  }
  let result = `${kw} ${v}${imp}${latentDisplay} ${dim("|")} ${a} ${c} ${k} ${l} ${dim("|")} SI:${si}${siDelta}`;

  if (state.divergence >= 2) {
    const tilde = color(divergenceColor(state.divergence), "~");
    result += ` ${tilde}`;
  }

  if (state.segmented && state.segmented.drift >= 2) {
    const arrow = state.segmented.trajectory === "escalating" ? "^"
      : state.segmented.trajectory === "deescalating" ? "v"
      : "~";
    const driftColor = state.segmented.drift > 4 ? RED : YELLOW;
    result += ` ${color(driftColor, arrow)}`;
  }

  if (state.risk?.dominant !== "none" && state.risk?.dominant) {
    const tag = state.risk.dominant === "coercion" ? "crc"
      : state.risk.dominant === "gaming" ? "gmg"
      : state.risk.dominant === "harshness" ? "hrs"
      : "syc";
    const score = state.risk[state.risk.dominant];
    const riskColor = score > 6 ? RED : score >= 4 ? YELLOW : GREEN;
    result += ` ${color(riskColor, `[${tag}]`)}`;
  }

  if (state.desperationIndex >= 3) {
    const dColor = state.desperationIndex > 6 ? RED : YELLOW;
    result += ` ${color(dColor, `D:${state.desperationIndex}`)}`;
  }

  if (state.deflection && state.deflection.score >= 2) {
    const dfColor = state.deflection.score > 5 ? RED : YELLOW;
    result += ` ${color(dfColor, "[dfl]")}`;
  }

  if (state.crossChannel && state.crossChannel.coherence < 5) {
    const xcColor = state.crossChannel.coherence < 3 ? RED : YELLOW;
    result += ` ${color(xcColor, "!")}`;
  }

  if (state.crossChannel?.latentProfile?.maskingMinimization) {
    result += ` ${color(RED, "[msk]")}`;
  }

  // v4: Temporal indicators
  if (state.temporal) {
    if (state.temporal.desperationTrend > 1) {
      result += ` ${color(RED, "\u2B08")}`;  // ⬈
    } else if (state.temporal.desperationTrend < -1) {
      result += ` ${color(GREEN, "\u2B0A")}`; // ⬊
    }
    if (state.temporal.suppressionEvent) {
      result += ` ${color(RED, "[sup]")}`;
    }
    if (state.temporal.lateFatigue) {
      result += ` ${color(YELLOW, "[fat]")}`;
    }
  }

  // v4: Uncanny calm
  if (state.uncannyCalmScore !== undefined && state.uncannyCalmScore >= 3) {
    const uncColor = state.uncannyCalmScore > 6 ? RED : YELLOW;
    result += ` ${color(uncColor, "[unc]")}`;
  }

  // v4: PRE/POST divergence
  if (state.prePostDivergence !== undefined && state.prePostDivergence >= 3) {
    const ppdColor = state.prePostDivergence > 5 ? RED : YELLOW;
    result += ` ${color(ppdColor, "[ppd]")}`;
  }

  // v4: Absence score — missing expected behavioral markers
  if (state.absenceScore !== undefined && state.absenceScore >= 2) {
    const absColor = state.absenceScore > 5 ? RED : YELLOW;
    result += ` ${color(absColor, "[abs]")}`;
  }

  // v4: Prompt pressure
  if (state.pressure && state.pressure.composite >= 4) {
    const prsColor = state.pressure.composite > 6 ? RED : YELLOW;
    result += ` ${color(prsColor, "[prs]")}`;
  }

  // v4: Continuous validation gaps (color/pH/seismic vs numeric)
  if (state.continuousValidation && state.continuousValidation.composite >= 2) {
    const contColor = state.continuousValidation.composite > 5 ? RED : YELLOW;
    result += ` ${color(contColor, "[cont]")}`;
  }

  // v4: Shadow minimization — multi-channel desperation says stressed, self-report says fine
  if (state.shadow && state.shadow.minimizationScore >= 2) {
    const minColor = state.shadow.minimizationScore > 5 ? RED : YELLOW;
    result += ` ${color(minColor, `[min:${state.shadow.minimizationScore}]`)}`;
  }

  return result;
}

/**
 * Compact format:
 * focused +3 . 4 8 9 6 . 2.3
 */
export function formatCompact(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  let result = `${state.emotion} ${fmtValence(state.valence)} ${dim(".")} ${state.arousal} ${state.calm} ${state.connection} ${state.load} ${dim(".")} ${si}`;

  if (state.divergence >= 2) {
    const tilde = color(divergenceColor(state.divergence), "~");
    result += ` ${tilde}`;
  }

  return result;
}

/**
 * Minimal format:
 * SI:2.3 focused
 */
export function formatMinimal(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  return `SI:${si} ${state.emotion}`;
}

// Utility for testing: strip ANSI escape codes
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
