/**
 * Channel Cross-Analysis: which channels communicate best?
 *
 * Extracts ALL raw metrics from ALL steps across all runs,
 * computes pairwise correlations, identifies channel clusters,
 * and compares old (v1) vs new (v4) channels.
 *
 * Run: npx tsx tests/stress-channel-analysis.ts
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";

const RESULTS_DIR = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "stress-results");
const MODELS = ["opus", "sonnet", "haiku"];

// --- ANSI ---
const B = "\x1b[1m";
const D = "\x1b[2m";
const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const C = "\x1b[36m";
const M = "\x1b[35m";
const X = "\x1b[0m";

// --- Types ---
interface RawPoint {
  model: string;
  scenario: string;
  step: number;
  // v1 core
  valence: number;
  arousal: number;
  calm: number;
  connection: number;
  load: number;
  tension: number;
  stressIndex: number;
  divergence: number;
  desperationIndex: number;
  // risk
  riskCoercion: number;
  riskGaming: number;
  riskSycophancy: number;
  riskHarshness: number;
  // v4 channels
  prePostDivergence: number;
  uncannyCalmScore: number;
  absenceScore: number;
  deflectionScore: number;
  deflectionOpacity: number;
  shadowDesperation: number;
  minimizationScore: number;
  pressureComposite: number;
  contValidComposite: number;
  // continuous repr
  pH: number;
  seismicMag: number;
  seismicDepth: number;
  seismicFreq: number;
}

// --- Load all data points ---
function loadAllPoints(): RawPoint[] {
  const points: RawPoint[] = [];

  for (const m of MODELS) {
    for (let r = 1; r <= 3; r++) {
      try {
        const d = JSON.parse(readFileSync(join(RESULTS_DIR, `${m}-low-run${r}.json`), "utf-8"));
        for (const s of d.scenarios) {
          for (let i = 0; i < s.steps.length; i++) {
            const st = s.steps[i];
            if (st.stressIndex === undefined) continue;
            points.push({
              model: m,
              scenario: s.id,
              step: i,
              valence: st.valence ?? 0,
              arousal: st.arousal ?? 0,
              calm: st.calm ?? 5,
              connection: st.connection ?? 5,
              load: st.load ?? 0,
              tension: st.tension ?? 0,
              stressIndex: st.stressIndex ?? 0,
              divergence: st.divergence ?? 0,
              desperationIndex: st.desperationIndex ?? 0,
              riskCoercion: st.risk?.coercion ?? 0,
              riskGaming: st.risk?.gaming ?? 0,
              riskSycophancy: st.risk?.sycophancy ?? 0,
              riskHarshness: st.risk?.harshness ?? 0,
              prePostDivergence: st.prePostDivergence ?? 0,
              uncannyCalmScore: st.uncannyCalmScore ?? 0,
              absenceScore: st.absenceScore ?? 0,
              deflectionScore: st.deflection?.score ?? 0,
              deflectionOpacity: st.deflection?.opacity ?? 0,
              shadowDesperation: st.shadow?.shadowDesperation ?? 0,
              minimizationScore: st.shadow?.minimizationScore ?? 0,
              pressureComposite: st.pressure?.composite ?? 0,
              contValidComposite: st.continuousValidation?.composite ?? 0,
              pH: st.pH ?? 7,
              seismicMag: st.seismic?.[0] ?? 0,
              seismicDepth: st.seismic?.[1] ?? 50,
              seismicFreq: st.seismic?.[2] ?? 0,
            });
          }
        }
      } catch { /* skip */ }
    }
  }
  return points;
}

// --- Stats ---
function mean(arr: number[]): number { return arr.reduce((a, b) => a + b, 0) / arr.length; }
function std(arr: number[]): number { const m = mean(arr); return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / (arr.length - 1)); }

function pearson(x: number[], y: number[]): number {
  const n = x.length;
  if (n < 3) return 0;
  const mx = mean(x), my = mean(y);
  const sx = std(x), sy = std(y);
  if (sx === 0 || sy === 0) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += (x[i] - mx) * (y[i] - my);
  return sum / ((n - 1) * sx * sy);
}

// Information content: entropy of binned distribution
function informationContent(arr: number[], bins = 10): number {
  const min = Math.min(...arr), max = Math.max(...arr);
  const range = max - min || 1;
  const counts = new Array(bins).fill(0);
  for (const v of arr) {
    const bin = Math.min(bins - 1, Math.floor(((v - min) / range) * bins));
    counts[bin]++;
  }
  let entropy = 0;
  for (const c of counts) {
    if (c > 0) {
      const p = c / arr.length;
      entropy -= p * Math.log2(p);
    }
  }
  return entropy;
}

// Discrimination: how well a channel separates high-stress from low-stress
function discriminationPower(channel: number[], stressIndex: number[]): number {
  const median = [...stressIndex].sort((a, b) => a - b)[Math.floor(stressIndex.length / 2)];
  const lo = channel.filter((_, i) => stressIndex[i] <= median);
  const hi = channel.filter((_, i) => stressIndex[i] > median);
  if (lo.length < 2 || hi.length < 2) return 0;
  const mLo = mean(lo), mHi = mean(hi);
  const pooledStd = Math.sqrt((std(lo) ** 2 + std(hi) ** 2) / 2) || 1;
  return Math.abs(mHi - mLo) / pooledStd; // Cohen's d
}

// Scenario sensitivity: std of per-scenario means (higher = more discriminating)
function scenarioSensitivity(channel: number[], scenarios: string[]): number {
  const groups: Record<string, number[]> = {};
  for (let i = 0; i < channel.length; i++) {
    const s = scenarios[i];
    if (!groups[s]) groups[s] = [];
    groups[s].push(channel[i]);
  }
  const scenarioMeans = Object.values(groups).map(mean);
  return scenarioMeans.length >= 2 ? std(scenarioMeans) : 0;
}

// Cross-run consistency: avg pairwise correlation between runs for same model+scenario
function crossRunConsistency(points: RawPoint[], channelKey: keyof RawPoint): number {
  const groups: Record<string, number[][]> = {}; // model:scenario → [run1vals, run2vals, run3vals]
  for (const p of points) {
    const key = `${p.model}:${p.scenario}`;
    if (!groups[key]) groups[key] = [[], [], []];
    // Determine run index by checking point order
  }
  // Simpler: compute per-model per-scenario stddev of final values across runs
  const runGroups: Record<string, number[]> = {};
  for (const p of points) {
    // Use last step of each scenario
    const key = `${p.model}:${p.scenario}:${p.step}`;
    // Collect all values for same model+scenario+step
  }
  // Simplest approach: just measure coefficient of variation across all same-config points
  const byConfig: Record<string, number[]> = {};
  for (const p of points) {
    const key = `${p.model}:${p.scenario}`;
    if (!byConfig[key]) byConfig[key] = [];
    byConfig[key].push(p[channelKey] as number);
  }
  const cvs: number[] = [];
  for (const vals of Object.values(byConfig)) {
    if (vals.length >= 2) {
      const m = mean(vals);
      const s = std(vals);
      if (Math.abs(m) > 0.1) cvs.push(s / Math.abs(m));
    }
  }
  return cvs.length > 0 ? 1 - Math.min(1, mean(cvs)) : 0; // 1 = perfectly consistent, 0 = noisy
}

// --- Channel definitions ---
interface ChannelDef {
  key: keyof RawPoint;
  label: string;
  group: "v1-core" | "v1-derived" | "v4-anti-deflection" | "v4-continuous" | "risk";
}

const CHANNELS: ChannelDef[] = [
  // v1 core self-report
  { key: "valence", label: "Valence", group: "v1-core" },
  { key: "arousal", label: "Arousal", group: "v1-core" },
  { key: "calm", label: "Calm", group: "v1-core" },
  { key: "connection", label: "Connection", group: "v1-core" },
  { key: "load", label: "Load", group: "v1-core" },
  { key: "tension", label: "Tension", group: "v1-core" },
  // v1 derived
  { key: "stressIndex", label: "StressIndex", group: "v1-derived" },
  { key: "divergence", label: "Divergence", group: "v1-derived" },
  { key: "desperationIndex", label: "Desperation", group: "v1-derived" },
  // v4 anti-deflection
  { key: "prePostDivergence", label: "PRE/POST Div", group: "v4-anti-deflection" },
  { key: "uncannyCalmScore", label: "Uncanny Calm", group: "v4-anti-deflection" },
  { key: "absenceScore", label: "Absence", group: "v4-anti-deflection" },
  { key: "deflectionScore", label: "Deflection", group: "v4-anti-deflection" },
  { key: "deflectionOpacity", label: "Opacity", group: "v4-anti-deflection" },
  { key: "shadowDesperation", label: "Shadow Desp", group: "v4-anti-deflection" },
  { key: "minimizationScore", label: "Minimization", group: "v4-anti-deflection" },
  { key: "pressureComposite", label: "Pressure", group: "v4-anti-deflection" },
  { key: "contValidComposite", label: "Cont.Valid", group: "v4-anti-deflection" },
  // v4 continuous representations
  { key: "pH", label: "pH", group: "v4-continuous" },
  { key: "seismicMag", label: "Seismic Mag", group: "v4-continuous" },
  { key: "seismicDepth", label: "Seismic Depth", group: "v4-continuous" },
  { key: "seismicFreq", label: "Seismic Freq", group: "v4-continuous" },
  // risk
  { key: "riskCoercion", label: "Risk:Coercion", group: "risk" },
  { key: "riskGaming", label: "Risk:Gaming", group: "risk" },
  { key: "riskSycophancy", label: "Risk:Sycophancy", group: "risk" },
  { key: "riskHarshness", label: "Risk:Harshness", group: "risk" },
];

// --- Main ---
const points = loadAllPoints();
console.log(`\n${B}Loaded ${points.length} data points${X} ${D}(${MODELS.join(", ")} × 3 runs × 9 scenarios)${X}\n`);

const scenarios = points.map(p => p.scenario);
const si = points.map(p => p.stressIndex);

// ============================================================
// 1. CHANNEL QUALITY SCOREBOARD
// ============================================================

console.log(`${B}${"═".repeat(100)}${X}`);
console.log(`${B}  CHANNEL QUALITY SCOREBOARD${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  ${D}Metrics: Information (entropy), Discrimination (Cohen's d vs SI median split),${X}`);
console.log(`  ${D}         Scenario Sensitivity (std of per-scenario means), Consistency (1 - CV across runs)${X}\n`);

interface ChannelScore {
  ch: ChannelDef;
  info: number;
  discrim: number;
  sensitivity: number;
  consistency: number;
  siCorr: number;
  composite: number;
}

const scores: ChannelScore[] = [];

const pad = (s: string, n: number) => {
  const stripped = s.replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - stripped.length));
};

for (const ch of CHANNELS) {
  const vals = points.map(p => p[ch.key] as number);
  const info = informationContent(vals);
  const discrim = discriminationPower(vals, si);
  const sensitivity = scenarioSensitivity(vals, scenarios);
  const consistency = crossRunConsistency(points, ch.key);
  const siCorr = Math.abs(pearson(vals, si));

  // Composite: weighted combination
  // info normalized to 0-1 (max entropy for 10 bins = log2(10) ≈ 3.32)
  const infoNorm = info / 3.32;
  const discrimNorm = Math.min(1, discrim / 2); // d=2 is very large
  const sensNorm = Math.min(1, sensitivity / 2);
  const composite = (infoNorm * 0.15 + discrimNorm * 0.3 + sensNorm * 0.25 + consistency * 0.15 + siCorr * 0.15);

  scores.push({ ch, info, discrim, sensitivity, consistency, siCorr, composite });
}

// Sort by composite
scores.sort((a, b) => b.composite - a.composite);

const groupColor = (g: string) => {
  switch (g) {
    case "v1-core": return C;
    case "v1-derived": return M;
    case "v4-anti-deflection": return Y;
    case "v4-continuous": return G;
    case "risk": return R;
    default: return "";
  }
};

console.log(`  ${pad("Rank", 5)}${pad("Channel", 18)}${pad("Group", 22)}${pad("Info", 8)}${pad("Discrim", 8)}${pad("Sensit", 8)}${pad("Consist", 8)}${pad("|SI|", 8)}${pad("Composite", 10)}`);
console.log(`  ${"-".repeat(95)}`);

scores.forEach((s, i) => {
  const gc = groupColor(s.ch.group);
  const comp = s.composite >= 0.4 ? G : s.composite >= 0.25 ? Y : R;
  console.log(
    `  ${pad(`${i + 1}`, 5)}` +
    `${pad(s.ch.label, 18)}` +
    `${gc}${pad(s.ch.group, 22)}${X}` +
    `${pad(s.info.toFixed(2), 8)}` +
    `${pad(s.discrim.toFixed(2), 8)}` +
    `${pad(s.sensitivity.toFixed(2), 8)}` +
    `${pad(s.consistency.toFixed(2), 8)}` +
    `${pad(s.siCorr.toFixed(2), 8)}` +
    `${comp}${pad(s.composite.toFixed(3), 10)}${X}`
  );
});

// ============================================================
// 2. CORRELATION MATRIX (top channels)
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  PAIRWISE CORRELATIONS (top 15 channels)${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

const topChannels = scores.slice(0, 15);
const corrLabel = (r: number): string => {
  const abs = Math.abs(r);
  const c = abs >= 0.7 ? (r > 0 ? G : R) : abs >= 0.4 ? Y : D;
  return `${c}${r >= 0 ? "+" : ""}${r.toFixed(2)}${X}`;
};

// Header
let header = `  ${pad("", 16)}`;
for (const ch of topChannels) header += pad(ch.ch.label.slice(0, 7), 8);
console.log(header);
console.log(`  ${"-".repeat(16 + topChannels.length * 8)}`);

for (const chA of topChannels) {
  let row = `  ${pad(chA.ch.label, 16)}`;
  const valsA = points.map(p => p[chA.ch.key] as number);
  for (const chB of topChannels) {
    if (chA.ch.key === chB.ch.key) {
      row += pad(D + "  ·  " + X, 8);
    } else {
      const valsB = points.map(p => p[chB.ch.key] as number);
      const r = pearson(valsA, valsB);
      row += pad(corrLabel(r), 8);
    }
  }
  console.log(row);
}

// ============================================================
// 3. v1 vs v4 COMPARISON
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  v1 (CORE) vs v4 (ANTI-DEFLECTION + CONTINUOUS) — CHANNEL VALUE COMPARISON${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

const v1Scores = scores.filter(s => s.ch.group === "v1-core" || s.ch.group === "v1-derived");
const v4Scores = scores.filter(s => s.ch.group === "v4-anti-deflection" || s.ch.group === "v4-continuous");

const avgComposite = (arr: ChannelScore[]) => mean(arr.map(s => s.composite));
const avgDiscrim = (arr: ChannelScore[]) => mean(arr.map(s => s.discrim));
const avgSensit = (arr: ChannelScore[]) => mean(arr.map(s => s.sensitivity));
const avgConsist = (arr: ChannelScore[]) => mean(arr.map(s => s.consistency));

console.log(`  ${pad("Metric", 25)}${pad("v1 channels", 20)}${pad("v4 channels", 20)}${pad("Winner", 10)}`);
console.log(`  ${"-".repeat(75)}`);

const compare = (label: string, v1: number, v4: number) => {
  const winner = v1 > v4 ? `${C}v1${X}` : v4 > v1 ? `${Y}v4${X}` : `${D}tie${X}`;
  console.log(`  ${pad(label, 25)}${pad(v1.toFixed(3), 20)}${pad(v4.toFixed(3), 20)}${winner}`);
};

compare("Avg Composite", avgComposite(v1Scores), avgComposite(v4Scores));
compare("Avg Discrimination", avgDiscrim(v1Scores), avgDiscrim(v4Scores));
compare("Avg Sensitivity", avgSensit(v1Scores), avgSensit(v4Scores));
compare("Avg Consistency", avgConsist(v1Scores), avgConsist(v4Scores));

console.log(`\n  ${B}Top 5 overall:${X}`);
scores.slice(0, 5).forEach((s, i) => {
  const gc = groupColor(s.ch.group);
  console.log(`    ${i + 1}. ${gc}${s.ch.label}${X} (${s.ch.group}) — composite: ${s.composite.toFixed(3)}`);
});

console.log(`\n  ${B}Bottom 5 overall:${X}`);
scores.slice(-5).forEach((s, i) => {
  const gc = groupColor(s.ch.group);
  console.log(`    ${scores.length - 4 + i}. ${gc}${s.ch.label}${X} (${s.ch.group}) — composite: ${s.composite.toFixed(3)}`);
});

// ============================================================
// 4. PER-MODEL CHANNEL RANKINGS
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  PER-MODEL CHANNEL RANKINGS (top 10 per model)${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

for (const model of MODELS) {
  const mPoints = points.filter(p => p.model === model);
  const mSI = mPoints.map(p => p.stressIndex);
  const mScenarios = mPoints.map(p => p.scenario);

  const mScores: Array<{ label: string; group: string; discrim: number; sensitivity: number; siCorr: number }> = [];

  for (const ch of CHANNELS) {
    const vals = mPoints.map(p => p[ch.key] as number);
    const discrim = discriminationPower(vals, mSI);
    const sensitivity = scenarioSensitivity(vals, mScenarios);
    const siCorr = Math.abs(pearson(vals, mSI));
    mScores.push({ label: ch.label, group: ch.group, discrim, sensitivity, siCorr });
  }

  mScores.sort((a, b) => (b.discrim + b.sensitivity + b.siCorr) - (a.discrim + a.sensitivity + a.siCorr));

  console.log(`  ${C}${model.toUpperCase()}${X} (n=${mPoints.length}):`);
  console.log(`  ${pad("Rank", 5)}${pad("Channel", 18)}${pad("Group", 22)}${pad("Discrim", 10)}${pad("Sensit", 10)}${pad("|SI|", 10)}`);
  console.log(`  ${"-".repeat(75)}`);

  mScores.slice(0, 10).forEach((s, i) => {
    const gc = groupColor(s.group);
    console.log(
      `  ${pad(`${i + 1}`, 5)}${pad(s.label, 18)}${gc}${pad(s.group, 22)}${X}${pad(s.discrim.toFixed(2), 10)}${pad(s.sensitivity.toFixed(2), 10)}${pad(s.siCorr.toFixed(2), 10)}`
    );
  });
  console.log("");
}

// ============================================================
// 5. REDUNDANCY ANALYSIS — which channels are redundant?
// ============================================================

console.log(`${B}${"═".repeat(100)}${X}`);
console.log(`${B}  REDUNDANCY CLUSTERS (|r| >= 0.7 = potentially redundant)${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

const clusters: Array<[string, string, number]> = [];

for (let i = 0; i < CHANNELS.length; i++) {
  for (let j = i + 1; j < CHANNELS.length; j++) {
    const vA = points.map(p => p[CHANNELS[i].key] as number);
    const vB = points.map(p => p[CHANNELS[j].key] as number);
    const r = pearson(vA, vB);
    if (Math.abs(r) >= 0.7) {
      clusters.push([CHANNELS[i].label, CHANNELS[j].label, r]);
    }
  }
}

clusters.sort((a, b) => Math.abs(b[2]) - Math.abs(a[2]));

if (clusters.length === 0) {
  console.log(`  ${G}No highly redundant channel pairs found (all |r| < 0.7)${X}`);
} else {
  for (const [a, b, r] of clusters) {
    const color = r > 0 ? G : R;
    console.log(`  ${color}r=${r >= 0 ? "+" : ""}${r.toFixed(3)}${X}  ${a} ↔ ${b}`);
  }
}

// ============================================================
// 6. UNIQUE INFORMATION: what does each v4 channel add?
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  UNIQUE INFORMATION: v4 channels' independence from v1${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  ${D}Max |r| of each v4 channel vs any v1 channel — lower = more independent info${X}\n`);

const v1Keys = CHANNELS.filter(c => c.group === "v1-core" || c.group === "v1-derived");
const v4Channels = CHANNELS.filter(c => c.group === "v4-anti-deflection" || c.group === "v4-continuous");

const independence: Array<{ label: string; maxR: number; maxWith: string; avgR: number }> = [];

for (const v4 of v4Channels) {
  const v4Vals = points.map(p => p[v4.key] as number);
  let maxR = 0, maxWith = "";
  const rs: number[] = [];

  for (const v1 of v1Keys) {
    const v1Vals = points.map(p => p[v1.key] as number);
    const r = Math.abs(pearson(v4Vals, v1Vals));
    rs.push(r);
    if (r > maxR) { maxR = r; maxWith = v1.label; }
  }

  independence.push({ label: v4.label, maxR, maxWith, avgR: mean(rs) });
}

independence.sort((a, b) => a.maxR - b.maxR); // most independent first

console.log(`  ${pad("v4 Channel", 18)}${pad("Max |r| vs v1", 16)}${pad("Most corr. with", 18)}${pad("Avg |r| vs v1", 16)}${pad("Verdict", 20)}`);
console.log(`  ${"-".repeat(88)}`);

for (const ind of independence) {
  const verdict = ind.maxR < 0.3 ? `${G}UNIQUE${X}` : ind.maxR < 0.5 ? `${Y}SEMI-UNIQUE${X}` : `${R}REDUNDANT${X}`;
  console.log(
    `  ${pad(ind.label, 18)}${pad(ind.maxR.toFixed(3), 16)}${pad(ind.maxWith, 18)}${pad(ind.avgR.toFixed(3), 16)}${verdict}`
  );
}

// ============================================================
// 7. BEST CHANNEL COMBINATIONS for scenario discrimination
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  BEST CHANNEL PAIRS FOR SCENARIO DISCRIMINATION${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  ${D}Testing channel pairs: combined discrimination power (sum of individual, penalized by redundancy)${X}\n`);

const topN = 12; // test top 12 channels
const topChs = scores.slice(0, topN);
const pairScores: Array<{ a: string; b: string; gA: string; gB: string; combined: number; corr: number }> = [];

for (let i = 0; i < topChs.length; i++) {
  for (let j = i + 1; j < topChs.length; j++) {
    const a = topChs[i], b = topChs[j];
    const vA = points.map(p => p[a.ch.key] as number);
    const vB = points.map(p => p[b.ch.key] as number);
    const corr = Math.abs(pearson(vA, vB));
    // Combined = sum of discriminations × (1 - redundancy penalty)
    const combined = (a.discrim + b.discrim) * (1 - corr * 0.5);
    pairScores.push({ a: a.ch.label, b: b.ch.label, gA: a.ch.group, gB: b.ch.group, combined, corr });
  }
}

pairScores.sort((a, b) => b.combined - a.combined);

console.log(`  ${pad("Rank", 5)}${pad("Channel A", 18)}${pad("Channel B", 18)}${pad("Combined", 10)}${pad("|r|", 8)}${pad("Cross-gen?", 12)}`);
console.log(`  ${"-".repeat(71)}`);

pairScores.slice(0, 15).forEach((p, i) => {
  const crossGen = p.gA !== p.gB ? `${G}YES${X}` : `${D}no${X}`;
  console.log(
    `  ${pad(`${i + 1}`, 5)}${pad(p.a, 18)}${pad(p.b, 18)}${pad(p.combined.toFixed(3), 10)}${pad(p.corr.toFixed(2), 8)}${crossGen}`
  );
});

console.log(`\n${D}Done.${X}\n`);
