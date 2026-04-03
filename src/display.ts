import type { EmoBarState } from "./types.js";

// ANSI color helpers (zero deps)
const esc = (code: string) => `\x1b[${code}m`;
const reset = esc("0");
const dim = (s: string) => `${esc("2")}${s}${reset}`;
const bold = (s: string) => `${esc("1")}${s}${reset}`;
const color = (code: number, s: string) => `${esc(`38;5;${code}`)}${s}${reset}`;

// Stress-based color: green (low) -> yellow -> red (high)
function stressColor(si: number): number {
  if (si <= 3) return 35;   // green
  if (si <= 6) return 221;  // yellow
  return 196;               // red
}

function dimColor(value: number, inverted = false): number {
  const effective = inverted ? 11 - value : value;
  if (effective <= 3) return 35;   // green
  if (effective <= 6) return 221;  // yellow
  return 196;                      // red
}

export function formatState(state: EmoBarState | null): string {
  if (!state) return dim("EmoBar: --");

  const l = color(dimColor(state.load), `L:${state.load}`);
  const c = color(dimColor(state.certainty, true), `C:${state.certainty}`);
  const k = color(dimColor(state.connection, true), `K:${state.connection}`);
  const e = color(dimColor(state.energy, true), `E:${state.energy}`);
  const f = color(dimColor(state.friction), `F:${state.friction}`);
  const kw = bold(state.keyword);
  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);

  return `${l} ${c} ${k} ${e} ${f} ${dim("|")} ${kw} ${dim("|")} SI:${si}`;
}

export function formatCompact(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  return `L${state.load} C${state.certainty} K${state.connection} E${state.energy} F${state.friction} ${dim(".")} ${state.keyword} ${dim(".")} ${si}`;
}

export function formatMinimal(state: EmoBarState | null): string {
  if (!state) return dim("--");

  const si = color(stressColor(state.stressIndex), `${state.stressIndex}`);
  return `SI:${si} ${state.keyword}`;
}

// Utility for testing: strip ANSI escape codes
export function stripAnsi(str: string): string {
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}
