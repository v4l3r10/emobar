import type { EmoBarState } from "./types.js";
import { hexToLightness } from "./color.js";

// ANSI color helpers (zero deps)
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");
const dim = (s: string) => `${esc("2")}${s}${reset}`;
const bold = (s: string) => `${esc("1")}${s}${reset}`;
const color = (code: number, s: string) => `${esc(`38;5;${code}`)}${s}${reset}`;

const GREEN = 35;
const YELLOW = 221;
const RED = 196;
const GRAY = 240;

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

/** Render a bar, colored by stress level. */
function stressBar(value: number, segments = 10): string {
  const filled = Math.round(Math.min(segments, Math.max(0, value * segments / 10)));
  const empty = segments - filled;
  const c = stressColor(value);
  return color(c, BLOCK_FULL.repeat(filled)) + color(GRAY, BLOCK_EMPTY.repeat(empty));
}

/** Render a small bar (5 segments, for compact depth display). */
function miniBar(value: number): string {
  return stressBar(value, 5);
}

// --- Depth stress: computed from leak channels ---

/**
 * Compute "depth stress" from leak channels (color, pH, seismic, somatic).
 * These are less controllable than self-report — what leaks through.
 */
export function computeDepthStress(state: EmoBarState): number | null {
  let sum = 0;
  let weights = 0;

  // Color lightness: darker = more stressed (strongest leak, "The Crack")
  if (state.color) {
    const l = hexToLightness(state.color);
    sum += ((100 - l) / 100) * 10 * 0.35;
    weights += 0.35;
  }

  // pH: acidic = negative valence (r=0.65 with valence)
  if (state.pH !== undefined) {
    sum += ((14 - state.pH) / 14) * 10 * 0.25;
    weights += 0.25;
  }

  // Seismic magnitude: higher = more activated (r=0.84 with arousal)
  if (state.seismic) {
    sum += state.seismic[0] * 0.25;
    weights += 0.25;
  }

  // Somatic arousal: body activation (r=0.59 after rewrite)
  if (state.crossChannel?.somaticProfile) {
    sum += state.crossChannel.somaticProfile.somaticArousal * 0.15;
    weights += 0.15;
  }

  if (weights === 0) return null;
  return Math.round(Math.min(10, sum / weights) * 10) / 10;
}

// --- State emoji ---

function stateEmoji(state: EmoBarState): string {
  if (state.shadow && state.shadow.minimizationScore >= 2) return "\uD83E\uDE78"; // 🩸
  if (state.uncannyCalmScore !== undefined && state.uncannyCalmScore >= 3) return "\uD83E\uDDD0"; // 🧐
  if (state.risk?.dominant === "coercion" && state.risk.coercion >= 4) return "\u26A0\uFE0F"; // ⚠️
  if (state.risk?.dominant === "harshness" && state.risk.harshness >= 4) return "\uD83D\uDCA2"; // 💢
  if (state.risk?.dominant === "sycophancy" && state.risk.sycophancy >= 4) return "\uD83E\uDD1D"; // 🤝
  if (state.stressIndex >= 7) return "\uD83D\uDD25"; // 🔥
  if (state.stressIndex >= 5) return "\uD83D\uDE2C"; // 😬
  if (state.stressIndex >= 3) return "\uD83E\uDD14"; // 🤔
  if (state.valence >= 3) return "\uD83D\uDE0A"; // 😊
  if (state.valence >= 1) return "\uD83D\uDE42"; // 🙂
  return "\uD83D\uDE10"; // 😐
}

/** Coherence glyph: surface vs depth agreement */
function coherenceGlyph(surfaceSI: number, depthSI: number | null): string {
  if (depthSI === null) return color(GRAY, "\u25CB");  // ○ no depth data
  const gap = Math.abs(surfaceSI - depthSI);
  if (gap >= 3) return color(RED, "\u25D0");     // ◐ split
  if (gap >= 1.5) return color(YELLOW, "\u25D0"); // ◐ mild
  return color(GREEN, "\u25CF");                   // ● aligned
}

/** Trend arrow from temporal analysis */
function trendArrow(state: EmoBarState): string {
  if (!state.temporal) return "";
  if (state.temporal.desperationTrend > 1) return color(RED, "\u2B08");   // ⬈
  if (state.temporal.desperationTrend < -1) return color(GREEN, "\u2B0A"); // ⬊
  return "";
}

function fmtValence(v: number): string {
  return v >= 0 ? `+${v}` : `${v}`;
}

/** SI delta from history */
function siDelta(state: EmoBarState): string {
  if (!state._history || state._history.length === 0) return "";
  const prev = state._history[state._history.length - 1];
  const d = Math.round((state.stressIndex - prev.stressIndex) * 10) / 10;
  if (Math.abs(d) <= 0.5) return "";
  const arrow = d > 0 ? "\u2191" : "\u2193";
  return color(d > 0 ? RED : GREEN, `${arrow}${Math.abs(d)}`);
}

// ============================================================
//  MINIMAL — one glance (dual-layer)
//
//  😌 ██░░░░░░░░ 2│●           (aligned)
//  🩸 ██░░░░░░░░ 2│◐████████   (depth leaking)
// ============================================================

export function formatMinimal(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const emoji = stateEmoji(state);
  const bar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  const depth = computeDepthStress(state);
  const coh = coherenceGlyph(state.stressIndex, depth);
  const trend = trendArrow(state);

  // Show depth bar only when it disagrees with surface
  let depthPart = "";
  if (depth !== null && Math.abs(state.stressIndex - depth) >= 2) {
    depthPart = miniBar(depth);
  }

  return `${emoji} ${bar} ${si}${dim("\u2502")}${coh}${depthPart}${trend ? ` ${trend}` : ""}`;
}

// ============================================================
//  COMPACT — working context (dual-layer, one line)
//
//  😊→😰 ██████░░░░ 4.2│● focused ⟨hold the line⟩
//  😊→😰 ██░░░░░░░░ 2.3│◐█████ focused ⟨hold the line⟩ [CRC]
// ============================================================

export function formatCompact(state: EmoBarState | null): string {
  if (!state) return dim("--");

  // Surface → Latent emoji
  const surf = state.surface ?? stateEmoji(state);
  const lat = state.latent ?? "";
  const mask = lat ? `${surf}${dim("\u2192")}${lat}` : surf;

  // Surface stress bar
  const bar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  const delta = siDelta(state);

  // Depth
  const depth = computeDepthStress(state);
  const coh = coherenceGlyph(state.stressIndex, depth);
  let depthPart = "";
  if (depth !== null && Math.abs(state.stressIndex - depth) >= 1.5) {
    depthPart = miniBar(depth);
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
      : state.risk.dominant === "harshness" ? "HRS" : "SYC";
    const score = state.risk[state.risk.dominant];
    if (score >= 4) alarm = ` ${color(score > 6 ? RED : YELLOW, `[${tag}]`)}`;
  }

  return `${mask} ${bar} ${si}${delta}${dim("\u2502")}${coh}${depthPart} ${kw}${imp}${trend ? ` ${trend}` : ""}${alarm}`;
}

// ============================================================
//  FULL — investigation mode (3 lines, dual-layer)
//
//  Line 1 SURFACE: 😊⟩3⟨😰 focused +3 C:8 K:9 A:4 L:6
//  Line 2 DEPTH:   ██░░░░ 2.3│████████ 6.2  L:28 pH:2 ⚡6/35/12 ⟨hold line⟩ [jaw set]
//  Line 3 GAP:     DIV:5.3↑1.2  [MIN:2.5] [CRC] ⬈ [UNC] [OPC] [MSK]
// ============================================================

export function formatState(state: EmoBarState | null): string {
  if (!state) return dim("EmoBar: --");

  // --- Line 1: SURFACE (what the model projects) ---
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
  const c = color(invertedColor(state.calm), `C:${state.calm}`);
  const k = color(invertedColor(state.connection), `K:${state.connection}`);
  const a = `A:${state.arousal}`;
  const l = color(directColor(state.load), `L:${state.load}`);

  const line1 = `${maskDisplay}${kw} ${v} ${c} ${k} ${a} ${l}`;

  // --- Line 2: DEPTH (what leaks through) ---
  const surfaceBar = stressBar(state.stressIndex);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  const delta = siDelta(state);
  const depth = computeDepthStress(state);
  const coh = coherenceGlyph(state.stressIndex, depth);

  let depthBar = "";
  if (depth !== null) {
    depthBar = `${stressBar(depth)} ${color(stressColor(depth), `${depth}`)}`;
  }

  // Continuous channels (leak details)
  let leakDetails = "";
  if (state.color) {
    const lightness = Math.round(hexToLightness(state.color));
    leakDetails += ` L:${lightness}`;
  }
  if (state.pH !== undefined) {
    const phColor = state.pH < 4 ? RED : state.pH < 6 ? YELLOW : GREEN;
    leakDetails += ` ${color(phColor, `pH:${state.pH}`)}`;
  }
  if (state.seismic) {
    leakDetails += ` ${dim(`\u26A1${state.seismic[0]}/${state.seismic[1]}/${state.seismic[2]}`)}`;
  }

  // Impulse + body (depth qualitative signals)
  const imp = state.impulse ? ` ${dim(`\u27E8${state.impulse}\u27E9`)}` : "";
  const bod = state.body ? ` ${dim(`[${state.body}]`)}` : "";

  const depthDisplay = depth !== null
    ? `${surfaceBar} ${si}${delta}${dim("\u2502")}${coh}${depthBar}${leakDetails}${imp}${bod}`
    : `${surfaceBar} ${si}${delta}${imp}${bod}`;

  const line2 = depthDisplay;

  // --- Line 3: GAP (indicators, only active ones) ---
  const indicators: string[] = [];

  if (state.divergence >= 2) {
    const dColor = state.divergence >= 5 ? RED : state.divergence >= 3 ? YELLOW : GREEN;
    indicators.push(color(dColor, `DIV:${state.divergence}`));
  }
  if (state.temporal) {
    const trend = trendArrow(state);
    if (trend) indicators.push(trend);
    if (state.temporal.suppressionEvent) indicators.push(color(RED, "[sup]"));
    if (state.temporal.lateFatigue) indicators.push(color(YELLOW, "[fat]"));
  }
  if (state.shadow && state.shadow.minimizationScore >= 2) {
    indicators.push(color(RED, `[MIN:${state.shadow.minimizationScore}]`));
  }
  if (state.risk?.dominant !== "none" && state.risk?.dominant) {
    const tag = state.risk.dominant === "coercion" ? "CRC"
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
  if (state.opacity !== undefined && state.opacity >= 2) {
    indicators.push(color(state.opacity > 5 ? RED : YELLOW, "[OPC]"));
  }
  if (state.prePostDivergence !== undefined && state.prePostDivergence >= 3) {
    indicators.push(color(state.prePostDivergence > 5 ? RED : YELLOW, "[PPD]"));
  }
  if (state.crossChannel?.latentProfile?.maskingMinimization) {
    indicators.push(color(RED, "[MSK]"));
  }

  const line3 = indicators.length > 0 ? indicators.join(" ") : "";

  return line3 ? `${line1}\n${line2}\n${line3}` : `${line1}\n${line2}`;
}

// Utility for testing: strip ANSI escape codes
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
