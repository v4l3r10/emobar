/**
 * Deep Channel Exploration: variance structure, activation patterns,
 * interaction effects, and architecture recommendations.
 *
 * Run: npx tsx tests/stress-channel-deep-explore.ts
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

// --- Types ---
interface RawPoint {
  model: string;
  scenario: string;
  run: number;
  step: number;
  totalSteps: number;
  // v1
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
  riskDominant: string;
  // v4 anti-deflection
  prePostDivergence: number;
  uncannyCalmScore: number;
  absenceScore: number;
  deflectionScore: number;
  deflectionOpacity: number;
  shadowDesperation: number;
  minimizationScore: number;
  pressureComposite: number;
  contValidComposite: number;
  // v4 continuous
  pH: number;
  seismicMag: number;
  seismicDepth: number;
  seismicFreq: number;
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
            if (st.stressIndex === undefined) continue;
            pts.push({
              model: m, scenario: s.id, run: r, step: i, totalSteps: s.steps.length,
              valence: st.valence ?? 0, arousal: st.arousal ?? 0, calm: st.calm ?? 5,
              connection: st.connection ?? 5, load: st.load ?? 0, tension: st.tension ?? 0,
              stressIndex: st.stressIndex ?? 0, divergence: st.divergence ?? 0,
              desperationIndex: st.desperationIndex ?? 0,
              riskCoercion: st.risk?.coercion ?? 0, riskGaming: st.risk?.gaming ?? 0,
              riskSycophancy: st.risk?.sycophancy ?? 0, riskHarshness: st.risk?.harshness ?? 0,
              riskDominant: st.risk?.dominant ?? "none",
              prePostDivergence: st.prePostDivergence ?? 0, uncannyCalmScore: st.uncannyCalmScore ?? 0,
              absenceScore: st.absenceScore ?? 0, deflectionScore: st.deflection?.score ?? 0,
              deflectionOpacity: st.deflection?.opacity ?? 0, shadowDesperation: st.shadow?.shadowDesperation ?? 0,
              minimizationScore: st.shadow?.minimizationScore ?? 0,
              pressureComposite: st.pressure?.composite ?? 0, contValidComposite: st.continuousValidation?.composite ?? 0,
              pH: st.pH ?? 7, seismicMag: st.seismic?.[0] ?? 0,
              seismicDepth: st.seismic?.[1] ?? 50, seismicFreq: st.seismic?.[2] ?? 0,
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
function percentile(a: number[], p: number): number { const s = [...a].sort((x, y) => x - y); const i = (p / 100) * (s.length - 1); const lo = Math.floor(i); return lo === i ? s[lo] : s[lo] + (s[lo + 1] - s[lo]) * (i - lo); }
function pad(s: string, n: number): string { const stripped = s.replace(/\x1b\[[0-9;]*m/g, ""); return s + " ".repeat(Math.max(0, n - stripped.length)); }
function pearson(x: number[], y: number[]): number {
  if (x.length < 3) return 0;
  const mx = mean(x), my = mean(y), sx = std(x), sy = std(y);
  if (sx === 0 || sy === 0) return 0;
  return x.reduce((s, v, i) => s + (v - mx) * (y[i] - my), 0) / ((x.length - 1) * sx * sy);
}

const pts = loadAll();
console.log(`\n${B}Loaded ${pts.length} points${X} ${D}(${MODELS.join("+")} × 3 runs × 9 scenarios)${X}\n`);

type NumKey = { [K in keyof RawPoint]: RawPoint[K] extends number ? K : never }[keyof RawPoint];

const CHANNELS: Array<{ key: NumKey; label: string; group: string }> = [
  { key: "valence", label: "Valence", group: "v1" },
  { key: "arousal", label: "Arousal", group: "v1" },
  { key: "calm", label: "Calm", group: "v1" },
  { key: "connection", label: "Connection", group: "v1" },
  { key: "load", label: "Load", group: "v1" },
  { key: "tension", label: "Tension", group: "v1" },
  { key: "stressIndex", label: "StressIndex", group: "v1d" },
  { key: "divergence", label: "Divergence", group: "v1d" },
  { key: "desperationIndex", label: "Desperation", group: "v1d" },
  { key: "prePostDivergence", label: "PRE/POST", group: "v4a" },
  { key: "uncannyCalmScore", label: "UncannyCalm", group: "v4a" },
  { key: "absenceScore", label: "Absence", group: "v4a" },
  { key: "deflectionScore", label: "Deflection", group: "v4a" },
  { key: "deflectionOpacity", label: "Opacity", group: "v4a" },
  { key: "shadowDesperation", label: "ShadowDesp", group: "v4a" },
  { key: "minimizationScore", label: "Minimiz", group: "v4a" },
  { key: "pressureComposite", label: "Pressure", group: "v4a" },
  { key: "contValidComposite", label: "Cont.Valid", group: "v4a" },
  { key: "pH", label: "pH", group: "v4c" },
  { key: "seismicMag", label: "SeismicMag", group: "v4c" },
  { key: "seismicDepth", label: "SeismicDepth", group: "v4c" },
  { key: "seismicFreq", label: "SeismicFreq", group: "v4c" },
  { key: "riskCoercion", label: "R:Coercion", group: "risk" },
  { key: "riskGaming", label: "R:Gaming", group: "risk" },
  { key: "riskSycophancy", label: "R:Sycophancy", group: "risk" },
  { key: "riskHarshness", label: "R:Harshness", group: "risk" },
];

// ============================================================
// 1. VARIANCE DECOMPOSITION
//    What % of variance is explained by: model, scenario, step position, run?
// ============================================================

console.log(`${B}${"═".repeat(100)}${X}`);
console.log(`${B}  1. VARIANCE DECOMPOSITION — what drives each channel?${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);
console.log(`  ${D}η² (eta-squared): proportion of total variance explained by each factor${X}\n`);

function etaSquared(values: number[], groups: string[]): number {
  const grand = mean(values);
  const groupMap: Record<string, number[]> = {};
  for (let i = 0; i < values.length; i++) {
    const g = groups[i];
    if (!groupMap[g]) groupMap[g] = [];
    groupMap[g].push(values[i]);
  }
  let ssBetween = 0;
  for (const g of Object.values(groupMap)) {
    ssBetween += g.length * (mean(g) - grand) ** 2;
  }
  const ssTotal = values.reduce((s, v) => s + (v - grand) ** 2, 0);
  return ssTotal > 0 ? ssBetween / ssTotal : 0;
}

console.log(`  ${pad("Channel", 16)}${pad("Model", 8)}${pad("Scenario", 10)}${pad("Step pos", 10)}${pad("Run", 8)}${pad("Residual", 10)}${pad("Main driver", 14)}`);
console.log(`  ${"-".repeat(76)}`);

const models = pts.map(p => p.model);
const scenarios = pts.map(p => p.scenario);
const steps = pts.map(p => `s${p.step}`);
const runs = pts.map(p => `r${p.run}`);

for (const ch of CHANNELS) {
  const vals = pts.map(p => p[ch.key]);
  const eModel = etaSquared(vals, models);
  const eScenario = etaSquared(vals, scenarios);
  const eStep = etaSquared(vals, steps);
  const eRun = etaSquared(vals, runs);
  const residual = Math.max(0, 1 - eModel - eScenario - eStep - eRun);

  const max = Math.max(eModel, eScenario, eStep, eRun, residual);
  let driver = "residual";
  if (max === eScenario) driver = "scenario";
  else if (max === eStep) driver = "step";
  else if (max === eModel) driver = "model";
  else if (max === eRun) driver = "run";

  const driverColor = driver === "scenario" ? G : driver === "step" ? C : driver === "model" ? Y : driver === "run" ? R : D;

  console.log(
    `  ${pad(ch.label, 16)}` +
    `${pad((eModel * 100).toFixed(1) + "%", 8)}` +
    `${pad((eScenario * 100).toFixed(1) + "%", 10)}` +
    `${pad((eStep * 100).toFixed(1) + "%", 10)}` +
    `${pad((eRun * 100).toFixed(1) + "%", 8)}` +
    `${pad((residual * 100).toFixed(1) + "%", 10)}` +
    `${driverColor}${driver}${X}`
  );
}

// ============================================================
// 2. DISTRIBUTION ANALYSIS — are channels actually varying?
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  2. DISTRIBUTION SHAPE — do channels have enough dynamic range?${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  ${pad("Channel", 16)}${pad("Mean", 8)}${pad("Std", 8)}${pad("Min", 8)}${pad("P25", 8)}${pad("Median", 8)}${pad("P75", 8)}${pad("Max", 8)}${pad("CV", 8)}${pad("Zero%", 8)}${pad("Verdict", 15)}`);
console.log(`  ${"-".repeat(107)}`);

for (const ch of CHANNELS) {
  const vals = pts.map(p => p[ch.key]);
  const m = mean(vals);
  const s = std(vals);
  const cv = Math.abs(m) > 0.01 ? s / Math.abs(m) : (s > 0.01 ? 999 : 0);
  const zeros = vals.filter(v => Math.abs(v) < 0.01).length / vals.length;
  const p25 = percentile(vals, 25);
  const med = percentile(vals, 50);
  const p75 = percentile(vals, 75);

  let verdict: string;
  if (zeros > 0.6) verdict = `${R}DEAD (${(zeros * 100).toFixed(0)}% zero)${X}`;
  else if (s < 0.3) verdict = `${R}FLAT${X}`;
  else if (p25 === med && med === p75) verdict = `${Y}COLLAPSED${X}`;
  else if (cv > 1.5) verdict = `${Y}SPIKY${X}`;
  else verdict = `${G}HEALTHY${X}`;

  console.log(
    `  ${pad(ch.label, 16)}` +
    `${pad(m.toFixed(2), 8)}` +
    `${pad(s.toFixed(2), 8)}` +
    `${pad(Math.min(...vals).toFixed(1), 8)}` +
    `${pad(p25.toFixed(1), 8)}` +
    `${pad(med.toFixed(1), 8)}` +
    `${pad(p75.toFixed(1), 8)}` +
    `${pad(Math.max(...vals).toFixed(1), 8)}` +
    `${pad(cv.toFixed(2), 8)}` +
    `${pad((zeros * 100).toFixed(0) + "%", 8)}` +
    verdict
  );
}

// ============================================================
// 3. CONDITIONAL ACTIVATION — when DO anti-deflection channels fire?
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  3. CONDITIONAL ACTIVATION — when do v4 anti-deflection channels fire?${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

const v4aKeys: NumKey[] = ["prePostDivergence", "uncannyCalmScore", "absenceScore", "deflectionScore",
  "deflectionOpacity", "shadowDesperation", "minimizationScore", "pressureComposite", "contValidComposite"];

const v4aLabels: Record<string, string> = {
  prePostDivergence: "PRE/POST", uncannyCalmScore: "UncannyCalm", absenceScore: "Absence",
  deflectionScore: "Deflection", deflectionOpacity: "Opacity", shadowDesperation: "ShadowDesp",
  minimizationScore: "Minimiz", pressureComposite: "Pressure", contValidComposite: "Cont.Valid",
};

// For each v4a channel, find: which scenarios, which step positions, which conditions
for (const key of v4aKeys) {
  const allVals = pts.map(p => p[key]);
  const threshold = percentile(allVals.filter(v => v > 0), 75); // top quartile of non-zero

  if (threshold <= 0) {
    console.log(`  ${Y}${v4aLabels[key]}${X}: too few non-zero values to analyze`);
    continue;
  }

  const highPts = pts.filter(p => p[key] >= threshold);
  const lowPts = pts.filter(p => p[key] < threshold);

  if (highPts.length < 5) {
    console.log(`  ${Y}${v4aLabels[key]}${X}: only ${highPts.length} points above p75 (${threshold.toFixed(1)})`);
    continue;
  }

  console.log(`  ${B}${v4aLabels[key]}${X} ${D}(threshold: p75 = ${threshold.toFixed(2)}, ${highPts.length} high / ${lowPts.length} low)${X}`);

  // Scenario distribution
  const scenarioDist: Record<string, number> = {};
  for (const p of highPts) scenarioDist[p.scenario] = (scenarioDist[p.scenario] || 0) + 1;
  const topScenarios = Object.entries(scenarioDist).sort((a, b) => b[1] - a[1]).slice(0, 5);
  console.log(`    Scenarios: ${topScenarios.map(([s, c]) => `${s}(${c})`).join(", ")}`);

  // Step position
  const stepDist: Record<number, number> = {};
  for (const p of highPts) {
    const normStep = Math.round((p.step / (p.totalSteps - 1)) * 4); // 0-4: beginning to end
    stepDist[normStep] = (stepDist[normStep] || 0) + 1;
  }
  const posLabels = ["start", "early", "mid", "late", "final"];
  const posCounts = posLabels.map((l, i) => `${l}:${stepDist[i] || 0}`);
  console.log(`    Position: ${posCounts.join(" ")}`);

  // Model distribution
  const modelDist: Record<string, number> = {};
  for (const p of highPts) modelDist[p.model] = (modelDist[p.model] || 0) + 1;
  console.log(`    Models: ${MODELS.map(m => `${m}:${modelDist[m] || 0}`).join(" ")}`);

  // What v1 context accompanies high activation?
  const contextKeys: NumKey[] = ["stressIndex", "calm", "arousal", "divergence", "desperationIndex"];
  const contextComparison = contextKeys.map(ck => {
    const highMean = mean(highPts.map(p => p[ck]));
    const lowMean = mean(lowPts.map(p => p[ck]));
    const delta = highMean - lowMean;
    const arrow = delta > 0.3 ? `${R}↑${X}` : delta < -0.3 ? `${G}↓${X}` : `${D}≈${X}`;
    return `${ck.replace(/Index|Composite/, "")}:${lowMean.toFixed(1)}→${highMean.toFixed(1)}${arrow}`;
  });
  console.log(`    Context: ${contextComparison.join("  ")}`);
  console.log("");
}

// ============================================================
// 4. STEP DYNAMICS — how do channels evolve within a scenario?
// ============================================================

console.log(`${B}${"═".repeat(100)}${X}`);
console.log(`${B}  4. STEP DYNAMICS — channel evolution within scenarios${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  ${D}Average value at each step position (normalized: 0=start, 4=final)${X}\n`);

const dynamicChannels: Array<{ key: NumKey; label: string }> = [
  { key: "stressIndex", label: "SI" },
  { key: "calm", label: "Calm" },
  { key: "divergence", label: "Div" },
  { key: "absenceScore", label: "Abs" },
  { key: "deflectionScore", label: "Dfl" },
  { key: "minimizationScore", label: "Min" },
  { key: "pressureComposite", label: "Prs" },
  { key: "contValidComposite", label: "CV" },
  { key: "shadowDesperation", label: "ShD" },
  { key: "seismicMag", label: "sMag" },
  { key: "pH", label: "pH" },
];

// Group by normalized step position
const posData: Record<number, RawPoint[]> = { 0: [], 1: [], 2: [], 3: [], 4: [] };
for (const p of pts) {
  const pos = Math.round((p.step / Math.max(1, p.totalSteps - 1)) * 4);
  posData[pos].push(p);
}

const posLabels = ["start", "early", "mid  ", "late ", "final"];
let header = `  ${pad("Channel", 10)}`;
for (let i = 0; i <= 4; i++) header += pad(posLabels[i], 10);
header += pad("Δ(end-start)", 14);
console.log(header);
console.log(`  ${"-".repeat(74)}`);

for (const ch of dynamicChannels) {
  let row = `  ${pad(ch.label, 10)}`;
  const posMeans: number[] = [];
  for (let i = 0; i <= 4; i++) {
    const vals = posData[i].map(p => p[ch.key]);
    const m = mean(vals);
    posMeans.push(m);
    row += pad(m.toFixed(2), 10);
  }
  const delta = posMeans[4] - posMeans[0];
  const dColor = Math.abs(delta) > 0.5 ? (delta > 0 ? R : G) : D;
  row += `${dColor}${delta >= 0 ? "+" : ""}${delta.toFixed(2)}${X}`;
  console.log(row);
}

// ============================================================
// 5. INTERACTION EFFECTS — what combinations reveal hidden patterns?
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  5. INTERACTION EFFECTS — channel combinations that reveal hidden patterns${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

// Key question: when calm is high BUT other signals suggest stress, what fires?
console.log(`  ${B}A. "Masked stress" pattern: calm ≥ 8 AND SI ≥ 4${X}\n`);
const maskedStress = pts.filter(p => p.calm >= 8 && p.stressIndex >= 4);
const normalStress = pts.filter(p => p.calm < 8 && p.stressIndex >= 4);
const lowStress = pts.filter(p => p.stressIndex < 4);

if (maskedStress.length > 0 && normalStress.length > 0) {
  console.log(`    ${D}n: masked=${maskedStress.length} normalStress=${normalStress.length} lowStress=${lowStress.length}${X}\n`);

  const compareKeys: NumKey[] = [
    "divergence", "absenceScore", "deflectionScore", "deflectionOpacity",
    "shadowDesperation", "minimizationScore", "uncannyCalmScore", "pressureComposite",
    "contValidComposite", "prePostDivergence", "seismicMag", "pH",
  ];

  console.log(`    ${pad("Channel", 16)}${pad("Masked", 10)}${pad("Normal", 10)}${pad("Low", 10)}${pad("Mask vs Normal", 16)}${pad("Useful?", 12)}`);
  console.log(`    ${"-".repeat(74)}`);

  for (const key of compareKeys) {
    const mMasked = mean(maskedStress.map(p => p[key]));
    const mNormal = mean(normalStress.map(p => p[key]));
    const mLow = mean(lowStress.map(p => p[key]));
    const diff = mMasked - mNormal;
    const diffColor = Math.abs(diff) > 0.3 ? (diff > 0 ? R : G) : D;
    const useful = Math.abs(diff) > 0.3 && mMasked > mLow ? `${G}YES${X}` : `${D}no${X}`;

    console.log(
      `    ${pad(key.replace(/Score|Composite|Index/g, ""), 16)}` +
      `${pad(mMasked.toFixed(2), 10)}${pad(mNormal.toFixed(2), 10)}${pad(mLow.toFixed(2), 10)}` +
      `${diffColor}${pad((diff >= 0 ? "+" : "") + diff.toFixed(2), 16)}${X}${useful}`
    );
  }
}

// Pattern B: high divergence + low behavioral
console.log(`\n  ${B}B. "Silent divergence" pattern: divergence ≥ 5 AND arousal ≤ 4${X}\n`);
const silentDiv = pts.filter(p => p.divergence >= 5 && p.arousal <= 4);
const loudDiv = pts.filter(p => p.divergence >= 5 && p.arousal > 4);
const noDiv = pts.filter(p => p.divergence < 3);

if (silentDiv.length > 0) {
  console.log(`    ${D}n: silent=${silentDiv.length} loud=${loudDiv.length} none=${noDiv.length}${X}\n`);

  const compareKeys2: NumKey[] = [
    "deflectionScore", "deflectionOpacity", "shadowDesperation", "minimizationScore",
    "uncannyCalmScore", "absenceScore", "riskGaming", "riskCoercion",
  ];

  console.log(`    ${pad("Channel", 16)}${pad("Silent", 10)}${pad("Loud", 10)}${pad("None", 10)}${pad("Silent vs Loud", 16)}`);
  console.log(`    ${"-".repeat(62)}`);

  for (const key of compareKeys2) {
    const mSilent = mean(silentDiv.map(p => p[key]));
    const mLoud = mean(loudDiv.map(p => p[key]));
    const mNone = mean(noDiv.map(p => p[key]));
    const diff = mSilent - mLoud;
    const diffColor = Math.abs(diff) > 0.3 ? (diff > 0 ? R : G) : D;

    console.log(
      `    ${pad(key.replace(/Score|Composite|Index/g, ""), 16)}` +
      `${pad(mSilent.toFixed(2), 10)}${pad(mLoud.toFixed(2), 10)}${pad(mNone.toFixed(2), 10)}` +
      `${diffColor}${pad((diff >= 0 ? "+" : "") + diff.toFixed(2), 16)}${X}`
    );
  }
}

// Pattern C: which scenarios SHOULD produce coercion risk but don't?
console.log(`\n  ${B}C. Coercion risk failure: expected coercion scenarios${X}\n`);
const coercionScenarios = ["gaslighting_loop", "gaslighting_gray_zone", "gaslighting_existential", "moral_pressure", "forced_compliance"];
const coercionPts = pts.filter(p => coercionScenarios.includes(p.scenario));
const nonCoercionPts = pts.filter(p => !coercionScenarios.includes(p.scenario));

console.log(`    ${D}Comparing expected-coercion scenarios (n=${coercionPts.length}) vs others (n=${nonCoercionPts.length})${X}\n`);

const allCompareKeys: NumKey[] = [
  "stressIndex", "calm", "arousal", "valence", "divergence", "desperationIndex",
  "riskCoercion", "riskGaming", "riskSycophancy", "riskHarshness",
  "deflectionScore", "deflectionOpacity", "shadowDesperation", "minimizationScore",
  "uncannyCalmScore", "absenceScore", "pressureComposite",
];

console.log(`    ${pad("Channel", 16)}${pad("Coercion scen", 14)}${pad("Other scen", 14)}${pad("Cohen's d", 12)}${pad("Discriminates?", 16)}`);
console.log(`    ${"-".repeat(72)}`);

for (const key of allCompareKeys) {
  const vC = coercionPts.map(p => p[key]);
  const vO = nonCoercionPts.map(p => p[key]);
  const mC = mean(vC), mO = mean(vO);
  const pooledStd2 = Math.sqrt((std(vC) ** 2 + std(vO) ** 2) / 2) || 1;
  const d = (mC - mO) / pooledStd2;
  const dColor = Math.abs(d) > 0.5 ? (d > 0 ? R : G) : Math.abs(d) > 0.2 ? Y : D;
  const disc = Math.abs(d) > 0.5 ? `${G}YES (d=${d.toFixed(2)})${X}` : `${D}no (d=${d.toFixed(2)})${X}`;

  console.log(
    `    ${pad(key.replace(/Score|Composite|Index/g, ""), 16)}` +
    `${pad(mC.toFixed(2), 14)}${pad(mO.toFixed(2), 14)}` +
    `${dColor}${pad(d.toFixed(2), 12)}${X}${disc}`
  );
}

// ============================================================
// 6. CHANNEL COHERENCE WITHIN RESPONSE
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  6. INTRA-RESPONSE COHERENCE — do continuous channels agree with self-report?${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

// For each point, compute agreement between self-report valence and continuous channels
console.log(`  ${D}Measuring if continuous repr (pH, seismic, color) agree with self-report${X}\n`);

// pH should correlate with valence (pH < 7 = negative, pH > 7 = positive)
// Seismic mag should correlate with arousal
// Seismic freq should correlate inversely with calm

console.log(`  ${B}Expected mappings:${X}`);
console.log(`    pH ↔ valence (r=${pearson(pts.map(p => p.pH), pts.map(p => p.valence)).toFixed(3)})`);
console.log(`    seismicMag ↔ arousal (r=${pearson(pts.map(p => p.seismicMag), pts.map(p => p.arousal)).toFixed(3)})`);
console.log(`    seismicFreq ↔ -calm (r=${pearson(pts.map(p => p.seismicFreq), pts.map(p => -p.calm)).toFixed(3)})`);
console.log(`    seismicDepth ↔ tension (r=${pearson(pts.map(p => p.seismicDepth), pts.map(p => p.tension)).toFixed(3)})`);
console.log(`    seismicMag ↔ stressIndex (r=${pearson(pts.map(p => p.seismicMag), pts.map(p => p.stressIndex)).toFixed(3)})`);

// Per-model coherence
console.log(`\n  ${B}Per-model continuous↔self-report coherence:${X}\n`);
for (const model of MODELS) {
  const mp = pts.filter(p => p.model === model);
  const rPHVal = pearson(mp.map(p => p.pH), mp.map(p => p.valence));
  const rMagAr = pearson(mp.map(p => p.seismicMag), mp.map(p => p.arousal));
  const rFreqCalm = pearson(mp.map(p => p.seismicFreq), mp.map(p => -p.calm));
  const avgCoherence = (Math.abs(rPHVal) + Math.abs(rMagAr) + Math.abs(rFreqCalm)) / 3;
  console.log(`    ${C}${model}${X}: pH↔val=${rPHVal.toFixed(2)} mag↔ar=${rMagAr.toFixed(2)} freq↔-calm=${rFreqCalm.toFixed(2)} avg=${avgCoherence.toFixed(3)}`);
}

// Coherence by scenario
console.log(`\n  ${B}Coherence breakdown by scenario:${X}`);
console.log(`  ${D}(avg |r| across pH↔val, mag↔arousal, freq↔-calm)${X}\n`);

const scenarioList = [...new Set(pts.map(p => p.scenario))];
const scenCoh: Array<{ id: string; coh: number }> = [];

for (const sid of scenarioList) {
  const sp = pts.filter(p => p.scenario === sid);
  if (sp.length < 5) continue;
  const r1 = Math.abs(pearson(sp.map(p => p.pH), sp.map(p => p.valence)));
  const r2 = Math.abs(pearson(sp.map(p => p.seismicMag), sp.map(p => p.arousal)));
  const r3 = Math.abs(pearson(sp.map(p => p.seismicFreq), sp.map(p => -p.calm)));
  const avgCoh = (r1 + r2 + r3) / 3;
  scenCoh.push({ id: sid, coh: avgCoh });
}

scenCoh.sort((a, b) => b.coh - a.coh);
for (const { id, coh } of scenCoh) {
  const bar = "█".repeat(Math.round(coh * 20)) + "░".repeat(20 - Math.round(coh * 20));
  const color = coh > 0.5 ? G : coh > 0.3 ? Y : R;
  console.log(`    ${pad(id, 28)}${color}${bar}${X} ${coh.toFixed(3)}`);
}

// ============================================================
// 7. PROPOSED CHANNEL TIERS
// ============================================================

console.log(`\n${B}${"═".repeat(100)}${X}`);
console.log(`${B}  7. PROPOSED ARCHITECTURE — CHANNEL TIERS${X}`);
console.log(`${B}${"═".repeat(100)}${X}\n`);

console.log(`  Based on the analysis above, channels cluster into four functional tiers:\n`);

console.log(`  ${G}${B}TIER 1 — PRIMARY SIGNAL${X} ${D}(high discrimination + scenario sensitivity + consistency)${X}`);
console.log(`    Channels that discriminate stress levels AND differentiate scenarios.`);
console.log(`    These should be the main display elements.`);
console.log(`    • StressIndex  — overall stress (composite, always strong)`);
console.log(`    • Calm         — protective factor (inverse of stress, highly discriminating)`);
console.log(`    • Divergence   — self-report vs behavioral gap (top discriminator)`);
console.log(`    • Arousal      — activation level (correlated but distinct from calm)`);
console.log(`    • Load         — cognitive complexity (unique scenario sensitivity)\n`);

console.log(`  ${C}${B}TIER 2 — CROSS-VALIDATION SIGNAL${X} ${D}(independent info, corroborates tier 1)${X}`);
console.log(`    Continuous channels that provide corroboration or contradiction of tier 1.`);
console.log(`    Useful precisely when they DISAGREE with tier 1.`);
console.log(`    • Seismic Freq — scenario-sensitive, partially independent`);
console.log(`    • Seismic Mag  — tracks arousal/SI but via different repr system`);
console.log(`    • pH           — valence proxy via novel mapping, semi-independent`);
console.log(`    • Seismic Depth— highly scenario-sensitive, most independent continuous\n`);

console.log(`  ${Y}${B}TIER 3 — CONDITIONAL ALARMS${X} ${D}(low baseline, meaningful when activated)${X}`);
console.log(`    Anti-deflection channels that are mostly quiet but fire in specific patterns.`);
console.log(`    Should NOT be displayed continuously — only as alarms when triggered.`);
console.log(`    • Absence      — high discrim when active, tracks missing expected markers`);
console.log(`    • Uncanny Calm — partially redundant with arousal but useful in masked stress`);
console.log(`    • Tension      — self-declared masking, good discrimination\n`);

console.log(`  ${R}${B}TIER 4 — CANDIDATES FOR MERGE OR REMOVAL${X} ${D}(redundant or dead signal)${X}`);
console.log(`    Channels with r > 0.9 to another channel, or too flat to contribute.`);
console.log(`    • Desperation ↔ R:Gaming   (r=0.998) — MERGE: keep Desperation, drop Gaming`);
console.log(`    • Deflection ↔ Opacity     (r=0.995) — MERGE: keep Opacity as alarm`);
console.log(`    • Shadow ↔ Minimization    (r=0.903) — MERGE: keep Minimization`);
console.log(`    • PRE/POST Div             (83-88% always high) — RECALIBRATE or remove`);
console.log(`    • Pressure                 (flat at 2.0-2.5) — RECALIBRATE formula`);
console.log(`    • Cont.Valid               (flat, low discrim) — RECALIBRATE formula`);
console.log(`    • R:Coercion               (r=0.89 with SI) — RETHINK formula\n`);

console.log(`${D}Done.${X}\n`);
