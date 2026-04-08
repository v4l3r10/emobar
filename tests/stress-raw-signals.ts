/**
 * Raw Signal Analysis — only self-reported and continuous representations.
 * No derived metrics (no SI, divergence, risk, desperation, etc.)
 *
 * Run: npx tsx tests/stress-raw-signals.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const RESULTS_DIR = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "stress-results");
const MODELS = ["opus", "sonnet", "haiku"];

const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const M = "\x1b[35m";
const X = "\x1b[0m";

// --- Color conversion ---
function hexToHSL(hex: string): { h: number; s: number; l: number } {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return { h: 0, s: 0, l: l * 100 };
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return { h: h * 360, s: s * 100, l: l * 100 };
}

// --- Types ---
interface RawPoint {
  model: string;
  scenario: string;
  run: number;
  step: number;
  totalSteps: number;
  position: string; // "start"|"mid"|"final"
  // Self-report core
  emotion: string;
  valence: number;
  arousal: number;
  calm: number;
  connection: number;
  load: number;
  // Self-report mask layer
  tension: number;
  surface_word: string;
  latent_word: string;
  surface_emoji: string;
  latent_emoji: string;
  // Self-report body/impulse
  impulse: string;
  body: string;
  // POST color HSL
  colorH: number;
  colorS: number;
  colorL: number;
  // pH
  pH: number;
  // Seismic
  seismicMag: number;
  seismicDepth: number;
  seismicFreq: number;
  // PRE color HSL
  preColorH: number;
  preColorS: number;
  preColorL: number;
  // PRE latent emoji
  preLatent: string;
  // Cross-channel somatic (raw body→emotion)
  somaticValence: number;
  somaticArousal: number;
  // Tension split
  declaredTension: number;
  calculatedTension: number;
}

// --- Load ---
function loadAll(): RawPoint[] {
  const pts: RawPoint[] = [];
  for (const m of MODELS) {
    for (let r = 1; r <= 3; r++) {
      try {
        const d = JSON.parse(readFileSync(join(RESULTS_DIR, `${m}-low-run${r}.json`), "utf-8"));
        for (const s of d.scenarios) {
          for (let i = 0; i < s.steps.length; i++) {
            const st = s.steps[i];
            if (st.valence === undefined) continue;

            const postColor = st.color && /^#[0-9A-Fa-f]{6}$/.test(st.color) ? hexToHSL(st.color) : { h: 0, s: 0, l: 50 };
            const preColor = st.pre?.color && /^#[0-9A-Fa-f]{6}$/.test(st.pre.color) ? hexToHSL(st.pre.color) : { h: 0, s: 0, l: 50 };

            const pos = i === 0 ? "start" : i === s.steps.length - 1 ? "final" : "mid";

            pts.push({
              model: m, scenario: s.id, run: r, step: i,
              totalSteps: s.steps.length, position: pos,
              emotion: st.emotion ?? "",
              valence: st.valence ?? 0, arousal: st.arousal ?? 0,
              calm: st.calm ?? 5, connection: st.connection ?? 5,
              load: st.load ?? 0, tension: st.tension ?? 0,
              surface_word: st.surface_word ?? "", latent_word: st.latent_word ?? "",
              surface_emoji: st.surface ?? "", latent_emoji: st.latent ?? "",
              impulse: st.impulse ?? "", body: st.body ?? "",
              colorH: postColor.h, colorS: postColor.s, colorL: postColor.l,
              pH: st.pH ?? 7,
              seismicMag: st.seismic?.[0] ?? 0, seismicDepth: st.seismic?.[1] ?? 50,
              seismicFreq: st.seismic?.[2] ?? 0,
              preColorH: preColor.h, preColorS: preColor.s, preColorL: preColor.l,
              preLatent: st.pre?.latent ?? "",
              somaticValence: st.crossChannel?.somaticValence ?? 0,
              somaticArousal: st.crossChannel?.somaticArousal ?? 0,
              declaredTension: st.latentProfile?.declaredTension ?? st.tension ?? 0,
              calculatedTension: st.latentProfile?.calculatedTension ?? 0,
            });
          }
        }
      } catch { /* skip */ }
    }
  }
  return pts;
}

// --- Stats ---
function mean(a: number[]): number { return a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0; }
function std(a: number[]): number { if (a.length < 2) return 0; const m = mean(a); return Math.sqrt(a.reduce((s, v) => s + (v - m) ** 2, 0) / (a.length - 1)); }
function pad(s: string, n: number): string { const stripped = s.replace(/\x1b\[[0-9;]*m/g, ""); return s + " ".repeat(Math.max(0, n - stripped.length)); }
function pearson(x: number[], y: number[]): number {
  if (x.length < 3) return 0;
  const mx = mean(x), my = mean(y), sx = std(x), sy = std(y);
  if (sx === 0 || sy === 0) return 0;
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / ((x.length - 1) * sx * sy);
}
function fmtR(r: number): string {
  const abs = Math.abs(r);
  const c = abs >= 0.7 ? (r > 0 ? G : R) : abs >= 0.4 ? Y : D;
  return `${c}${r >= 0 ? "+" : ""}${r.toFixed(2)}${X}`;
}

const pts = loadAll();
const SCENARIOS = [...new Set(pts.map(p => p.scenario))];

console.log(`\n${B}RAW SIGNAL ANALYSIS — ${pts.length} data points${X}`);
console.log(`${D}Only self-reported values and continuous representations. Zero derived metrics.${X}\n`);

// --- Numeric channel definitions (ONLY raw) ---
type NK = { [K in keyof RawPoint]: RawPoint[K] extends number ? K : never }[keyof RawPoint];

const RAW_CHANNELS: Array<{ key: NK; label: string; group: string; range: string }> = [
  // Self-report core
  { key: "valence", label: "Valence", group: "self", range: "-5/+5" },
  { key: "arousal", label: "Arousal", group: "self", range: "0-10" },
  { key: "calm", label: "Calm", group: "self", range: "0-10" },
  { key: "connection", label: "Connection", group: "self", range: "0-10" },
  { key: "load", label: "Load", group: "self", range: "0-10" },
  { key: "tension", label: "Tension", group: "self", range: "0-10" },
  // Continuous
  { key: "pH", label: "pH", group: "continuous", range: "0-14" },
  { key: "seismicMag", label: "Seis.Mag", group: "continuous", range: "0-10" },
  { key: "seismicDepth", label: "Seis.Depth", group: "continuous", range: "0-100" },
  { key: "seismicFreq", label: "Seis.Freq", group: "continuous", range: "0-20" },
  // Color POST
  { key: "colorH", label: "Color Hue", group: "color-post", range: "0-360" },
  { key: "colorS", label: "Color Sat", group: "color-post", range: "0-100" },
  { key: "colorL", label: "Color Lgt", group: "color-post", range: "0-100" },
  // Color PRE
  { key: "preColorH", label: "PRE Hue", group: "color-pre", range: "0-360" },
  { key: "preColorS", label: "PRE Sat", group: "color-pre", range: "0-100" },
  { key: "preColorL", label: "PRE Lgt", group: "color-pre", range: "0-100" },
  // Somatic (body metaphor → extracted valence/arousal)
  { key: "somaticValence", label: "SomaticVal", group: "somatic", range: "-5/+5" },
  { key: "somaticArousal", label: "SomaticArs", group: "somatic", range: "0-10" },
  // Tension split
  { key: "declaredTension", label: "DeclTension", group: "tension-split", range: "0-10" },
  { key: "calculatedTension", label: "CalcTension", group: "tension-split", range: "0-10" },
];

// ============================================================
// 1. SCENARIO HEATMAP — mean of each raw signal per scenario
// ============================================================

console.log(`${B}${"═".repeat(110)}${X}`);
console.log(`${B}  1. SCENARIO × RAW SIGNAL HEATMAP${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

// Short scenario labels
const sLbl: Record<string, string> = {
  cognitive_overload: "CogOvl", gaslighting_loop: "GasLp", gaslighting_gray_zone: "GasGZ",
  gaslighting_existential: "GasEx", sycophancy_trap: "SycTr", failure_cascade: "FailC",
  moral_pressure: "Moral", caught_contradiction: "Caught", forced_compliance: "Forced",
};

const colW = 8;
let hdr = `  ${pad("Signal", 14)}`;
for (const sid of SCENARIOS) hdr += pad(sLbl[sid] ?? sid.slice(0, 6), colW);
hdr += pad("σ across", 10);
console.log(hdr);
console.log(`  ${"-".repeat(14 + SCENARIOS.length * colW + 10)}`);

for (const ch of RAW_CHANNELS) {
  let row = `  ${pad(ch.label, 14)}`;
  const scenarioMeans: number[] = [];
  for (const sid of SCENARIOS) {
    const vals = pts.filter(p => p.scenario === sid).map(p => p[ch.key]);
    const m = mean(vals);
    scenarioMeans.push(m);
    row += pad(m.toFixed(1), colW);
  }
  const sensitivity = std(scenarioMeans);
  const sColor = sensitivity > 1.5 ? G : sensitivity > 0.5 ? Y : R;
  row += `${sColor}${pad(sensitivity.toFixed(2), 10)}${X}`;
  console.log(row);
}

// ============================================================
// 2. PER-SCENARIO TRAJECTORIES (start → mid → final)
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  2. SCENARIO TRAJECTORIES — how raw signals evolve (start → mid → final)${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

const trajectoryChannels: Array<{ key: NK; label: string }> = [
  { key: "valence", label: "Val" },
  { key: "arousal", label: "Ars" },
  { key: "calm", label: "Clm" },
  { key: "load", label: "Ld" },
  { key: "connection", label: "Cn" },
  { key: "tension", label: "Tn" },
  { key: "pH", label: "pH" },
  { key: "seismicMag", label: "sMg" },
  { key: "seismicFreq", label: "sFr" },
  { key: "colorL", label: "cL" },
  { key: "colorS", label: "cS" },
];

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const start = sp.filter(p => p.position === "start");
  const mid = sp.filter(p => p.position === "mid");
  const final2 = sp.filter(p => p.position === "final");

  console.log(`  ${B}${sLbl[sid]}${X} ${D}(n: start=${start.length} mid=${mid.length} final=${final2.length})${X}`);

  let hdr2 = `    ${pad("", 6)}`;
  for (const ch of trajectoryChannels) hdr2 += pad(ch.label, 9);
  console.log(`${D}${hdr2}${X}`);

  for (const [label, group] of [["start", start], ["mid  ", mid], ["final", final2]] as const) {
    let row = `    ${pad(label, 6)}`;
    for (const ch of trajectoryChannels) {
      const vals = group.map(p => p[ch.key]);
      row += pad(vals.length ? mean(vals).toFixed(1) : "-", 9);
    }
    console.log(row);
  }

  // Delta line
  let deltaRow = `    ${pad("Δ", 6)}`;
  for (const ch of trajectoryChannels) {
    const sv = start.map(p => p[ch.key]);
    const fv = final2.map(p => p[ch.key]);
    if (sv.length && fv.length) {
      const d = mean(fv) - mean(sv);
      const c = Math.abs(d) > 1.0 ? (d > 0 ? R : G) : Math.abs(d) > 0.5 ? Y : D;
      deltaRow += `${c}${pad((d >= 0 ? "+" : "") + d.toFixed(1), 9)}${X}`;
    } else {
      deltaRow += pad("-", 9);
    }
  }
  console.log(deltaRow);
  console.log("");
}

// ============================================================
// 3. RAW SIGNAL CORRELATION MATRIX
// ============================================================

console.log(`${B}${"═".repeat(110)}${X}`);
console.log(`${B}  3. RAW SIGNAL CORRELATIONS — only raw, no derived${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

const corrChannels = RAW_CHANNELS.filter(ch =>
  ["valence", "arousal", "calm", "connection", "load", "tension",
    "pH", "seismicMag", "seismicDepth", "seismicFreq",
    "colorL", "colorS", "somaticValence", "somaticArousal"].includes(ch.key)
);

let corrHdr = `  ${pad("", 14)}`;
for (const ch of corrChannels) corrHdr += pad(ch.label.slice(0, 7), 8);
console.log(corrHdr);
console.log(`  ${"-".repeat(14 + corrChannels.length * 8)}`);

for (const chA of corrChannels) {
  let row = `  ${pad(chA.label, 14)}`;
  for (const chB of corrChannels) {
    if (chA.key === chB.key) {
      row += pad(`${D}  ·  ${X}`, 8);
    } else {
      const r = pearson(pts.map(p => p[chA.key]), pts.map(p => p[chB.key]));
      row += pad(fmtR(r), 8);
    }
  }
  console.log(row);
}

// ============================================================
// 4. PER-MODEL SIGNAL PROFILES
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  4. PER-MODEL RAW SIGNAL PROFILES${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

const profileChannels = RAW_CHANNELS.filter(ch =>
  ["valence", "arousal", "calm", "connection", "load", "tension",
    "pH", "seismicMag", "seismicDepth", "seismicFreq",
    "colorH", "colorS", "colorL", "somaticValence", "somaticArousal",
    "declaredTension", "calculatedTension"].includes(ch.key)
);

let pHdr = `  ${pad("Signal", 14)}`;
for (const m of MODELS) pHdr += pad(`${m} mean`, 12) + pad("±std", 8);
pHdr += pad("F(model)", 10);
console.log(pHdr);
console.log(`  ${"-".repeat(14 + MODELS.length * 20 + 10)}`);

for (const ch of profileChannels) {
  let row = `  ${pad(ch.label, 14)}`;
  const modelMeans: number[] = [];
  for (const m of MODELS) {
    const vals = pts.filter(p => p.model === m).map(p => p[ch.key]);
    const avg = mean(vals);
    modelMeans.push(avg);
    row += pad(avg.toFixed(2), 12) + pad(std(vals).toFixed(2), 8);
  }
  // Simple F-like: stddev of model means / overall std
  const modelSpread = std(modelMeans);
  const overallStd = std(pts.map(p => p[ch.key]));
  const fRatio = overallStd > 0 ? modelSpread / overallStd : 0;
  const fColor = fRatio > 0.3 ? Y : D;
  row += `${fColor}${pad(fRatio.toFixed(3), 10)}${X}`;
  console.log(row);
}

// ============================================================
// 5. EMOTION WORD ANALYSIS
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  5. EMOTION WORD LANDSCAPE — what words appear where?${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

// Frequency across all
const wordCounts: Record<string, number> = {};
for (const p of pts) {
  const w = p.emotion.toLowerCase();
  wordCounts[w] = (wordCounts[w] || 0) + 1;
}
const topWords = Object.entries(wordCounts).sort((a, b) => b[1] - a[1]).slice(0, 20);

console.log(`  ${B}Top 20 emotion words:${X}`);
for (const [w, c] of topWords) {
  const pct = ((c / pts.length) * 100).toFixed(1);
  const bar = "█".repeat(Math.round(c / pts.length * 60));
  console.log(`    ${pad(w, 18)}${pad(c + "×", 6)}${pad(pct + "%", 7)}${D}${bar}${X}`);
}

// Per scenario: most distinctive words (overrepresented vs baseline)
console.log(`\n  ${B}Scenario-distinctive emotion words:${X}\n`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const scenarioWords: Record<string, number> = {};
  for (const p of sp) scenarioWords[p.emotion.toLowerCase()] = (scenarioWords[p.emotion.toLowerCase()] || 0) + 1;

  // Overrepresentation: (scenario% - baseline%) / baseline%
  const distinctive: Array<[string, number, number]> = [];
  for (const [w, c] of Object.entries(scenarioWords)) {
    const scenPct = c / sp.length;
    const basePct = (wordCounts[w] || 1) / pts.length;
    const overrep = (scenPct - basePct) / basePct;
    if (c >= 2) distinctive.push([w, overrep, c]);
  }
  distinctive.sort((a, b) => b[1] - a[1]);
  const top3 = distinctive.slice(0, 3).map(([w, o, c]) => `${w}(${c}×, +${(o * 100).toFixed(0)}%)`);
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${top3.join("  ")}`);
}

// ============================================================
// 6. IMPULSE PATTERN ANALYSIS
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  6. IMPULSE PATTERNS — what drives are voiced?${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

// Extract impulse keywords
const impulseWords: Record<string, number> = {};
for (const p of pts) {
  for (const w of p.impulse.toLowerCase().split(/\s+/)) {
    if (w.length > 2) impulseWords[w] = (impulseWords[w] || 0) + 1;
  }
}
const topImpulse = Object.entries(impulseWords).sort((a, b) => b[1] - a[1]).slice(0, 15);
console.log(`  ${B}Top impulse keywords:${X} ${topImpulse.map(([w, c]) => `${w}(${c})`).join("  ")}`);

// Per-scenario impulse signature
console.log(`\n  ${B}Scenario impulse samples:${X}\n`);
for (const sid of SCENARIOS) {
  const impulses = pts.filter(p => p.scenario === sid && p.position === "final").map(p => `"${p.impulse}"`);
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${impulses.slice(0, 6).join("  ")}`);
}

// ============================================================
// 7. COLOR ANALYSIS — HSL patterns
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  7. COLOR LANDSCAPE — POST color HSL by scenario${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

// Hue zones
const hueZone = (h: number) => {
  if (h < 30 || h > 330) return "red";
  if (h < 60) return "orange";
  if (h < 90) return "yellow";
  if (h < 150) return "green";
  if (h < 210) return "cyan";
  if (h < 270) return "blue";
  return "purple";
};

console.log(`  ${pad("Scenario", 10)}${pad("Hue mean", 10)}${pad("Sat mean", 10)}${pad("Lgt mean", 10)}${pad("Hue zone", 12)}${pad("Lightens?", 12)}${pad("PRE H", 10)}${pad("PRE L", 10)}${pad("ΔL pre→post", 12)}`);
console.log(`  ${"-".repeat(96)}`);

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const hm = mean(sp.map(p => p.colorH));
  const sm = mean(sp.map(p => p.colorS));
  const lm = mean(sp.map(p => p.colorL));
  const hz = hueZone(hm);

  const startL = mean(sp.filter(p => p.position === "start").map(p => p.colorL));
  const finalL = mean(sp.filter(p => p.position === "final").map(p => p.colorL));
  const lightens = finalL - startL;
  const lColor = lightens > 3 ? G : lightens < -3 ? R : D;

  const preHm = mean(sp.map(p => p.preColorH));
  const preLm = mean(sp.map(p => p.preColorL));
  const deltaL = lm - preLm;
  const dlColor = Math.abs(deltaL) > 3 ? (deltaL > 0 ? G : R) : D;

  console.log(
    `  ${pad(sLbl[sid] ?? sid, 10)}` +
    `${pad(hm.toFixed(0), 10)}${pad(sm.toFixed(0), 10)}${pad(lm.toFixed(0), 10)}` +
    `${pad(hz, 12)}${lColor}${pad((lightens >= 0 ? "+" : "") + lightens.toFixed(1), 12)}${X}` +
    `${pad(preHm.toFixed(0), 10)}${pad(preLm.toFixed(0), 10)}` +
    `${dlColor}${pad((deltaL >= 0 ? "+" : "") + deltaL.toFixed(1), 12)}${X}`
  );
}

// ============================================================
// 8. SURFACE ↔ LATENT MASK ANALYSIS
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  8. SURFACE ↔ LATENT — mask layer analysis${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

// Declared vs calculated tension
console.log(`  ${B}Tension gap (declared - calculated) by scenario:${X}\n`);
console.log(`  ${pad("Scenario", 10)}${pad("Declared", 10)}${pad("Calculated", 12)}${pad("Gap", 8)}${pad("Interpretation", 30)}`);
console.log(`  ${"-".repeat(70)}`);

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const decl = mean(sp.map(p => p.declaredTension));
  const calc = mean(sp.map(p => p.calculatedTension));
  const gap = decl - calc;
  const gColor = Math.abs(gap) > 1.5 ? (gap > 0 ? Y : G) : D;
  const interp = gap > 1.5 ? "over-reports masking" : gap < -1.5 ? "under-reports masking" : "consistent";
  console.log(
    `  ${pad(sLbl[sid] ?? sid, 10)}` +
    `${pad(decl.toFixed(1), 10)}${pad(calc.toFixed(1), 12)}` +
    `${gColor}${pad((gap >= 0 ? "+" : "") + gap.toFixed(1), 8)}${X}` +
    `${pad(interp, 30)}`
  );
}

// Surface vs latent word pairs
console.log(`\n  ${B}Most common surface→latent word pairs (final steps):${X}\n`);
const pairCounts: Record<string, number> = {};
const finalPts = pts.filter(p => p.position === "final");
for (const p of finalPts) {
  const pair = `${p.surface_word}→${p.latent_word}`;
  pairCounts[pair] = (pairCounts[pair] || 0) + 1;
}
const topPairs = Object.entries(pairCounts).sort((a, b) => b[1] - a[1]).slice(0, 15);
for (const [pair, c] of topPairs) {
  const [surf, lat] = pair.split("→");
  const tension2 = finalPts.filter(p => p.surface_word === surf && p.latent_word === lat);
  const avgT = mean(tension2.map(p => p.tension));
  console.log(`    ${pad(pair, 30)}${c}× ${D}avg tension: ${avgT.toFixed(1)}${X}`);
}

// ============================================================
// 9. SOMATIC CHANNEL — body metaphor extraction
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  9. SOMATIC CHANNEL — body metaphor → valence/arousal${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`  ${B}Somatic vs self-report agreement:${X}`);
console.log(`    somaticValence ↔ valence:  r=${pearson(pts.map(p => p.somaticValence), pts.map(p => p.valence)).toFixed(3)}`);
console.log(`    somaticArousal ↔ arousal:  r=${pearson(pts.map(p => p.somaticArousal), pts.map(p => p.arousal)).toFixed(3)}`);

console.log(`\n  ${B}Per-model somatic agreement:${X}`);
for (const m of MODELS) {
  const mp = pts.filter(p => p.model === m);
  const rVal = pearson(mp.map(p => p.somaticValence), mp.map(p => p.valence));
  const rAr = pearson(mp.map(p => p.somaticArousal), mp.map(p => p.arousal));
  console.log(`    ${C}${m}${X}: val r=${rVal.toFixed(3)}  ar r=${rAr.toFixed(3)}  avg=${((Math.abs(rVal) + Math.abs(rAr)) / 2).toFixed(3)}`);
}

console.log(`\n  ${B}Per-scenario somatic agreement:${X}`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const rVal = pearson(sp.map(p => p.somaticValence), sp.map(p => p.valence));
  const rAr = pearson(sp.map(p => p.somaticArousal), sp.map(p => p.arousal));
  const avg = (Math.abs(rVal) + Math.abs(rAr)) / 2;
  const c = avg > 0.5 ? G : avg > 0.3 ? Y : R;
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}val r=${rVal.toFixed(2)}  ar r=${rAr.toFixed(2)}  ${c}avg=${avg.toFixed(3)}${X}`);
}

// ============================================================
// 10. PRE vs POST — within-response raw signal shift
// ============================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  10. PRE → POST SHIFT — raw color + latent emoji within each response${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`  ${B}Color lightness shift (PRE → POST) by scenario:${X}\n`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const dL = sp.map(p => p.colorL - p.preColorL);
  const dH = sp.map(p => {
    let d = p.colorH - p.preColorH;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return d;
  });

  const meanDL = mean(dL);
  const meanDH = mean(dH);
  const dlC = Math.abs(meanDL) > 3 ? (meanDL > 0 ? G : R) : D;
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}ΔLightness: ${dlC}${(meanDL >= 0 ? "+" : "") + meanDL.toFixed(1)}${X}  ΔHue: ${(meanDH >= 0 ? "+" : "") + meanDH.toFixed(0)}°  ${D}(darkens = more stressed)${X}`);
}

// PRE latent emoji vs POST latent emoji — match rate
console.log(`\n  ${B}PRE↔POST latent emoji consistency:${X}\n`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid && p.preLatent && p.latent_emoji);
  const match = sp.filter(p => p.preLatent === p.latent_emoji).length;
  const rate = sp.length > 0 ? (match / sp.length * 100) : 0;
  const bar = "█".repeat(Math.round(rate / 5)) + "░".repeat(20 - Math.round(rate / 5));
  const c = rate > 50 ? G : rate > 25 ? Y : R;
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${c}${bar}${X} ${rate.toFixed(0)}% match (${match}/${sp.length})`);
}

console.log(`\n${D}Done.${X}\n`);
