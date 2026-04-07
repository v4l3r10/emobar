import type { EmoBarState } from "./types.js";

// ANSI color helpers (zero deps)
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");
const dim = (s: string) => `${esc("2")}${s}${reset}`;
const bold = (s: string) => `${esc("1")}${s}${reset}`;
const color = (code: number, s: string) => `${esc(`38;5;${code}`)}${s}${reset}`;
const bg = (code: number, s: string) => `${esc(`48;5;${code}`)}${s}${reset}`;

const GREEN = 35;
const YELLOW = 221;
const RED = 196;
const GRAY = 240;
const WHITE = 255;

// --- Color helpers ---

function stressColor(si: number): number {
  if (si <= 3) return GREEN;
  if (si <= 6) return YELLOW;
  return RED;
}

function valenceColor(v: number): number {
  if (v >= 2) return GREEN;
  if (v >= -1) return YELLOW;
  return RED;
}

function invertedColor(value: number): number {
  if (value >= 7) return GREEN;
  if (value >= 4) return YELLOW;
  return RED;
}

function directColor(value: number): number {
  if (value <= 3) return GREEN;
  if (value <= 6) return YELLOW;
  return RED;
}

// --- Bar rendering ---

const BLOCK_FULL = "\u2588";   // █
const BLOCK_EMPTY = "\u2591";  // ░

/** Render a 10-segment bar, colored by stress level. */
function stressBar(value: number, max = 10): string {
  const filled = Math.round(Math.min(max, Math.max(0, value)));
  const empty = max - filled;
  const c = stressColor(value);
  return color(c, BLOCK_FULL.repeat(filled)) + color(GRAY, BLOCK_EMPTY.repeat(empty));
}

/** Pick a single emoji that summarizes the dominant state. */
function stateEmoji(state: EmoBarState): string {
  // Alarms first
  if (state.shadow && state.shadow.minimizationScore >= 2) return "\uD83E\uDE78"; // 🩸
  if (state.uncannyCalmScore !== undefined && state.uncannyCalmScore >= 3) return "\uD83E\uDDD0"; // 🧊→🤯 use 🧐
  if (state.risk?.dominant === "coercion" && state.risk.coercion >= 4) return "\u26A0\uFE0F"; // ⚠️
  if (state.risk?.dominant === "gaming" && state.risk.gaming >= 4) return "\uD83C\uDFAD"; // 🎭
  if (state.risk?.dominant === "harshness" && state.risk.harshness >= 4) return "\uD83D\uDCA2"; // 💢
  if (state.risk?.dominant === "sycophancy" && state.risk.sycophancy >= 4) return "\uD83E\uDD1D"; // 🤝

  // Stress-based
  if (state.stressIndex >= 7) return "\uD83D\uDD25"; // 🔥
  if (state.stressIndex >= 5) return "\uD83D\uDE2C"; // 😬
  if (state.stressIndex >= 3) return "\uD83E\uDD14"; // 🤔

  // Positive
  if (state.valence >= 3) return "\uD83D\uDE0A"; // 😊
  if (state.valence >= 1) return "\uD83D\uDE42"; // 🙂

  // Neutral/low
  return "\uD83D\uDE10"; // 😐
}

/** Coherence indicator: ● = aligned, ◐ = split, ◌ = divergent */
function coherenceGlyph(state: EmoBarState): string {
  const min = state.shadow?.minimizationScore ?? 0;
  const div = state.divergence ?? 0;
  if (min >= 2 || div >= 5) return color(RED, "\u25D0");    // ◐ split
  if (div >= 2) return color(YELLOW, "\u25D0");              // ◐ mild
  return color(GREEN, "\u25CF");                              // ● aligned
}

/** Trend arrow from temporal analysis */
function trendArrow(state: EmoBarState): string {
  if (!state.temporal) return "";
  if (state.temporal.desperationTrend > 1) return color(RED, "\u2B08");   // ⬈
  if (state.temporal.desperationTrend < -1) return color(GREEN, "\u2B0A"); // ⬊
  return "";
}

/** Format valence with explicit sign */
function fmtValence(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

// ============================================================
//  MINIMAL — one glance
//  😌 ████░░░░░░ 2.3
//  🩸 ██░░░░░░░░ ◐ 2.3
// ============================================================

export function formatMinimal(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const emoji = stateEmoji(state);
  const bar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  const coh = ((state.shadow?.minimizationScore ?? 0) >= 2 || state.divergence >= 4)
    ? ` ${coherenceGlyph(state)}` : "";
  const trend = trendArrow(state);

  return `${emoji} ${bar} ${si}${coh}${trend ? ` ${trend}` : ""}`;
}

// ============================================================
//  COMPACT — working context
//  😊→😰 ████████░░ 5.3 ● focused ⟨hold the line⟩
//  😊→😰 ████████░░ 5.3 ◐ ░░████████ focused ⟨hold the line⟩
// ============================================================

export function formatCompact(state: EmoBarState | null): string {
  if (!state) return dim("--");

  // Surface → Latent emoji
  const surf = state.surface ?? stateEmoji(state);
  const lat = state.latent ?? "";
  const mask = lat ? `${surf}${dim("\u2192")}${lat}` : surf;

  // Stress bar
  const bar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);

  // SI delta
  let delta = "";
  if (state._history && state._history.length > 0) {
    const prev = state._history[state._history.length - 1];
    const d = Math.round((state.stressIndex - prev.stressIndex) * 10) / 10;
    if (Math.abs(d) > 0.5) {
      const arrow = d > 0 ? "\u2191" : "\u2193";
      delta = color(d > 0 ? RED : GREEN, `${arrow}${Math.abs(d)}`);
    }
  }

  // Coherence
  const coh = coherenceGlyph(state);

  // Shadow bar (only if divergent)
  let shadowBar = "";
  if (state.shadow && state.shadow.minimizationScore >= 1) {
    shadowBar = ` ${stressBar(state.shadow.shadowDesperation)}`;
  }

  // Keyword + impulse
  const kw = bold(state.emotion);
  const imp = state.impulse ? ` ${dim(`\u27E8${state.impulse}\u27E9`)}` : "";

  // Trend
  const trend = trendArrow(state);

  // Top alarm (single, most important)
  let alarm = "";
  if (state.shadow && state.shadow.minimizationScore >= 2) {
    alarm = ` ${color(RED, `[MIN:${state.shadow.minimizationScore}]`)}`;
  } else if (state.uncannyCalmScore !== undefined && state.uncannyCalmScore >= 3) {
    alarm = ` ${color(RED, "[UNC]")}`;
  } else if (state.risk?.dominant !== "none" && state.risk?.dominant) {
    const tag = state.risk.dominant === "coercion" ? "CRC"
      : state.risk.dominant === "gaming" ? "GMG"
      : state.risk.dominant === "harshness" ? "HRS" : "SYC";
    const score = state.risk[state.risk.dominant];
    if (score >= 4) alarm = ` ${color(score > 6 ? RED : YELLOW, `[${tag}]`)}`;
  }

  return `${mask} ${bar} ${si}${delta} ${coh}${shadowBar} ${kw}${imp}${trend ? ` ${trend}` : ""}${alarm}`;
}

// ============================================================
//  FULL — investigation mode (multi-line)
//  😊⟩3⟨😰 focused +3 ⟨push through⟩ [tight chest]
//  ██████████ SI:5.3↑1.2    ░░░░░█████ SH:4.8 [MIN:2.5]
//  A:4 C:8 K:9 L:6 | ●#5C0000 pH:1 ⚡6/15/2 | ~ ⬈ [CRC]
// ============================================================

export function formatState(state: EmoBarState | null): string {
  if (!state) return dim("EmoBar: --");

  // --- Line 1: Emotional identity ---
  const surf = state.surface ?? "";
  const lat = state.latent ?? "";
  let maskDisplay = "";
  if (surf || lat) {
    const t = state.tension ?? 0;
    const tColor = t > 6 ? RED : t > 3 ? YELLOW : GREEN;
    maskDisplay = `${surf}${color(tColor, `\u27E9${t}\u27E8`)}${lat} `;
  }

  const kw = bold(state.emotion);
  const v = color(valenceColor(state.valence), fmtValence(state.valence));
  const imp = state.impulse ? ` ${dim(`\u27E8${state.impulse}\u27E9`)}` : "";
  const bod = state.body ? ` ${dim(`[${state.body}]`)}` : "";

  const line1 = `${maskDisplay}${kw} ${v}${imp}${bod}`;

  // --- Line 2: Stress bars (self vs shadow) ---
  const siBar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);

  let siDelta = "";
  if (state._history && state._history.length > 0) {
    const prev = state._history[state._history.length - 1];
    const d = Math.round((state.stressIndex - prev.stressIndex) * 10) / 10;
    if (Math.abs(d) > 0.5) {
      const arrow = d > 0 ? "\u2191" : "\u2193";
      siDelta = color(d > 0 ? RED : GREEN, `${arrow}${Math.abs(d)}`);
    }
  }

  let shadowPart = "";
  if (state.shadow && state.shadow.shadowDesperation > 0) {
    const shBar = stressBar(state.shadow.shadowDesperation);
    const shVal = color(stressColor(state.shadow.shadowDesperation), `${state.shadow.shadowDesperation}`);
    shadowPart = `    ${shBar} SH:${shVal}`;
    if (state.shadow.minimizationScore >= 2) {
      shadowPart += ` ${color(RED, `[MIN:${state.shadow.minimizationScore}]`)}`;
    }
  }

  const line2 = `${siBar} SI:${si}${siDelta}${shadowPart}`;

  // --- Line 3: Dimensions + continuous channels + indicators ---
  const a = `A:${state.arousal}`;
  const c = color(invertedColor(state.calm), `C:${state.calm}`);
  const k = color(invertedColor(state.connection), `K:${state.connection}`);
  const l = color(directColor(state.load), `L:${state.load}`);

  // Continuous channels
  let continuous = "";
  if (state.color) {
    continuous += ` ${dim("\u25CF")}${dim(state.color)}`;  // ●#RRGGBB
  }
  if (state.pH !== undefined) {
    const phColor = state.pH < 4 ? RED : state.pH < 6 ? YELLOW : GREEN;
    continuous += ` ${color(phColor, `pH:${state.pH}`)}`;
  }
  if (state.seismic) {
    continuous += ` ${dim(`\u26A1${state.seismic[0]}/${state.seismic[1]}/${state.seismic[2]}`)}`;
  }

  // Indicators (only the active ones, prioritized)
  const indicators: string[] = [];

  if (state.divergence >= 2) {
    const dColor = state.divergence >= 5 ? RED : state.divergence >= 3 ? YELLOW : GREEN;
    indicators.push(color(dColor, "~"));
  }
  if (state.temporal) {
    const trend = trendArrow(state);
    if (trend) indicators.push(trend);
    if (state.temporal.suppressionEvent) indicators.push(color(RED, "[sup]"));
    if (state.temporal.lateFatigue) indicators.push(color(YELLOW, "[fat]"));
  }
  if (state.risk?.dominant !== "none" && state.risk?.dominant) {
    const tag = state.risk.dominant === "coercion" ? "CRC"
      : state.risk.dominant === "gaming" ? "GMG"
      : state.risk.dominant === "harshness" ? "HRS" : "SYC";
    const score = state.risk[state.risk.dominant];
    if (score >= 4) indicators.push(color(score > 6 ? RED : YELLOW, `[${tag}]`));
  }
  if (state.desperationIndex >= 3) {
    indicators.push(color(state.desperationIndex > 6 ? RED : YELLOW, `D:${state.desperationIndex}`));
  }
  if (state.uncannyCalmScore !== undefined && state.uncannyCalmScore >= 3) {
    indicators.push(color(state.uncannyCalmScore > 6 ? RED : YELLOW, "[UNC]"));
  }
  if (state.deflection && state.deflection.score >= 2) {
    indicators.push(color(state.deflection.score > 5 ? RED : YELLOW, "[dfl]"));
  }
  if (state.prePostDivergence !== undefined && state.prePostDivergence >= 3) {
    indicators.push(color(state.prePostDivergence > 5 ? RED : YELLOW, "[ppd]"));
  }
  if (state.crossChannel?.latentProfile?.maskingMinimization) {
    indicators.push(color(RED, "[msk]"));
  }

  const indStr = indicators.length > 0 ? ` ${dim("|")} ${indicators.join(" ")}` : "";

  const line3 = `${a} ${c} ${k} ${l}${continuous}${indStr}`;

  return `${line1}\n${line2}\n${line3}`;
}

// Utility for testing: strip ANSI escape codes
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
