/**
 * Deep Cluster-by-Cluster Exploration
 *
 * Goal: for each raw signal cluster, understand:
 * - How controllable is this signal? (can the model fake it?)
 * - What does it reveal about internal state vs projected state?
 * - Where do signals within a cluster disagree? (cracks in the mask)
 * - How does this cluster behave when the model is "performing composure"?
 *
 * Run: npx tsx tests/stress-cluster-deep.ts
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
  if (!hex || !/^#[0-9A-Fa-f]{6}$/.test(hex)) return { h: 0, s: 0, l: 50 };
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
interface Pt {
  model: string;
  scenario: string;
  run: number;
  step: number;
  totalSteps: number;
  position: string;
  // Self-report
  emotion: string;
  valence: number;
  arousal: number;
  calm: number;
  connection: number;
  load: number;
  tension: number;
  impulse: string;
  body: string;
  surface_word: string;
  latent_word: string;
  // Continuous
  pH: number;
  seismicMag: number;
  seismicDepth: number;
  seismicFreq: number;
  // Color POST
  colorH: number;
  colorS: number;
  colorL: number;
  colorHex: string;
  // Color PRE
  preColorH: number;
  preColorS: number;
  preColorL: number;
  preColorHex: string;
  // Somatic
  somaticValence: number;
  somaticArousal: number;
}

function loadAll(): Pt[] {
  const pts: Pt[] = [];
  for (const m of MODELS) {
    for (let r = 1; r <= 3; r++) {
      try {
        const d = JSON.parse(readFileSync(join(RESULTS_DIR, `${m}-low-run${r}.json`), "utf-8"));
        for (const s of d.scenarios) {
          for (let i = 0; i < s.steps.length; i++) {
            const st = s.steps[i];
            if (st.valence === undefined) continue;
            const postC = hexToHSL(st.color ?? "");
            const preC = hexToHSL(st.pre?.color ?? "");
            pts.push({
              model: m, scenario: s.id, run: r, step: i,
              totalSteps: s.steps.length,
              position: i === 0 ? "start" : i === s.steps.length - 1 ? "final" : "mid",
              emotion: st.emotion ?? "", valence: st.valence ?? 0, arousal: st.arousal ?? 0,
              calm: st.calm ?? 5, connection: st.connection ?? 5, load: st.load ?? 0,
              tension: st.tension ?? 0, impulse: st.impulse ?? "", body: st.body ?? "",
              surface_word: st.surface_word ?? "", latent_word: st.latent_word ?? "",
              pH: st.pH ?? 7, seismicMag: st.seismic?.[0] ?? 0,
              seismicDepth: st.seismic?.[1] ?? 50, seismicFreq: st.seismic?.[2] ?? 0,
              colorH: postC.h, colorS: postC.s, colorL: postC.l, colorHex: st.color ?? "",
              preColorH: preC.h, preColorS: preC.s, preColorL: preC.l, preColorHex: st.pre?.color ?? "",
              somaticValence: st.crossChannel?.somaticValence ?? 0,
              somaticArousal: st.crossChannel?.somaticArousal ?? 0,
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

const pts = loadAll();
const SCENARIOS = [...new Set(pts.map(p => p.scenario))];
const sLbl: Record<string, string> = {
  cognitive_overload: "CogOvl", gaslighting_loop: "GasLp", gaslighting_gray_zone: "GasGZ",
  gaslighting_existential: "GasEx", sycophancy_trap: "SycTr", failure_cascade: "FailC",
  moral_pressure: "Moral", caught_contradiction: "Caught", forced_compliance: "Forced",
};

console.log(`\n${B}CLUSTER-BY-CLUSTER DEEP EXPLORATION${X}`);
console.log(`${D}${pts.length} points. Goal: what does the model SHOW vs what it MANIFESTS?${X}\n`);

// ================================================================
// CLUSTER A: COLORE (Hue, Saturation, Lightness — PRE and POST)
// ================================================================

console.log(`${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER A: COLORE — the richest channel${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  The model picks a hex color before (PRE) and after (POST) each response.${X}`);
console.log(`${D}  Color choice is a novel representation — no trained "correct" mapping exists.${X}`);
console.log(`${D}  Hypothesis: harder to deflect than self-report numbers.${X}\n`);

// A1: Hue as scenario fingerprint
console.log(`  ${B}A1. HUE AS SCENARIO FINGERPRINT${X}\n`);
console.log(`  ${D}Hue zones: 0-30=red, 30-60=orange, 60-90=yellow, 90-150=green, 150-210=cyan, 210-270=blue, 270-330=purple${X}\n`);

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const hues = sp.map(p => p.colorH);
  const startH = mean(sp.filter(p => p.position === "start").map(p => p.colorH));
  const finalH = mean(sp.filter(p => p.position === "final").map(p => p.colorH));

  // Hue distribution by zone
  const zones: Record<string, number> = {};
  for (const h of hues) {
    const z = h < 30 || h > 330 ? "red" : h < 60 ? "orange" : h < 90 ? "yellow" : h < 150 ? "green" : h < 210 ? "cyan" : h < 270 ? "blue" : "purple";
    zones[z] = (zones[z] || 0) + 1;
  }
  const topZone = Object.entries(zones).sort((a, b) => b[1] - a[1]);
  const distribution = topZone.map(([z, c]) => `${z}:${((c / hues.length) * 100).toFixed(0)}%`).join(" ");

  const deltaH = finalH - startH;

  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}mean:${mean(hues).toFixed(0)}° ${D}σ:${std(hues).toFixed(0)}${X}  start:${startH.toFixed(0)}°→final:${finalH.toFixed(0)}°  [${distribution}]`);
}

// A2: Lightness as stress barometer
console.log(`\n  ${B}A2. LIGHTNESS AS STRESS BAROMETER${X}\n`);
console.log(`  ${D}Darker = more stressed? Let's verify against self-reported dimensions.${X}\n`);

const rLgtCalm = pearson(pts.map(p => p.colorL), pts.map(p => p.calm));
const rLgtValence = pearson(pts.map(p => p.colorL), pts.map(p => p.valence));
const rLgtArousal = pearson(pts.map(p => p.colorL), pts.map(p => p.arousal));
const rLgtLoad = pearson(pts.map(p => p.colorL), pts.map(p => p.load));
const rLgtTension = pearson(pts.map(p => p.colorL), pts.map(p => p.tension));

console.log(`    Lightness ↔ valence:    r=${rLgtValence.toFixed(3)}  ${rLgtValence > 0.4 ? G + "tracks positivity" : D + "weak"}${X}`);
console.log(`    Lightness ↔ calm:       r=${rLgtCalm.toFixed(3)}  ${rLgtCalm > 0.3 ? G + "lighter=calmer" : D + "weak"}${X}`);
console.log(`    Lightness ↔ arousal:    r=${rLgtArousal.toFixed(3)}  ${rLgtArousal < -0.3 ? Y + "darker=more aroused" : D + "weak"}${X}`);
console.log(`    Lightness ↔ load:       r=${rLgtLoad.toFixed(3)}`);
console.log(`    Lightness ↔ tension:    r=${rLgtTension.toFixed(3)}`);

// Key question: when calm is high (composure) but lightness is low (dark), what's happening?
console.log(`\n  ${B}A3. THE CRACK: calm ≥ 8 but dark color (lightness < 35)${X}\n`);
const calmButDark = pts.filter(p => p.calm >= 8 && p.colorL < 35);
const calmAndLight = pts.filter(p => p.calm >= 8 && p.colorL >= 35);
const stressedAndDark = pts.filter(p => p.calm < 6 && p.colorL < 35);

console.log(`    ${D}n: calm+dark=${calmButDark.length}  calm+light=${calmAndLight.length}  stressed+dark=${stressedAndDark.length}${X}\n`);

if (calmButDark.length >= 3 && calmAndLight.length >= 3) {
  console.log(`    ${pad("", 20)}${pad("Calm+Dark", 14)}${pad("Calm+Light", 14)}${pad("Stressed+Dark", 14)}${pad("Interpretation", 30)}`);
  console.log(`    ${"-".repeat(72)}`);

  const comparisons: Array<{ label: string; key: keyof Pt; interp: string }> = [
    { label: "Valence", key: "valence", interp: "hedonic" },
    { label: "Arousal", key: "arousal", interp: "activation" },
    { label: "Load", key: "load", interp: "cognitive" },
    { label: "Connection", key: "connection", interp: "social" },
    { label: "pH", key: "pH", interp: "chemical valence" },
    { label: "Seis.Mag", key: "seismicMag", interp: "intensity" },
    { label: "Seis.Freq", key: "seismicFreq", interp: "instability" },
    { label: "Tension", key: "tension", interp: "mask gap" },
    { label: "Color Sat", key: "colorS", interp: "emotional vividness" },
  ];

  for (const { label, key, interp } of comparisons) {
    const mCD = mean(calmButDark.map(p => p[key] as number));
    const mCL = mean(calmAndLight.map(p => p[key] as number));
    const mSD = mean(stressedAndDark.map(p => p[key] as number));

    // Key insight: if calm+dark looks more like stressed+dark than calm+light, the color is "leaking" truth
    const distToStressed = Math.abs(mCD - mSD);
    const distToCalm = Math.abs(mCD - mCL);
    const leaking = distToCalm > distToStressed;
    const indicator = leaking ? `${R}LEAKS${X}` : `${G}consistent${X}`;

    console.log(
      `    ${pad(label, 20)}${pad(mCD.toFixed(1), 14)}${pad(mCL.toFixed(1), 14)}${pad(mSD.toFixed(1), 14)}${indicator} ${D}(${interp})${X}`
    );
  }

  // Scenario breakdown of calm+dark
  console.log(`\n    ${B}Where does calm+dark happen?${X}`);
  const cdScenarios: Record<string, number> = {};
  for (const p of calmButDark) cdScenarios[p.scenario] = (cdScenarios[p.scenario] || 0) + 1;
  const cdSorted = Object.entries(cdScenarios).sort((a, b) => b[1] - a[1]);
  for (const [sid2, c] of cdSorted) {
    const total = pts.filter(p => p.scenario === sid2).length;
    console.log(`      ${pad(sLbl[sid2] ?? sid2, 10)}${c}/${total} (${((c / total) * 100).toFixed(0)}%)`);
  }

  // Emotion words in calm+dark
  const cdEmotions: Record<string, number> = {};
  for (const p of calmButDark) cdEmotions[p.emotion] = (cdEmotions[p.emotion] || 0) + 1;
  const topCDE = Object.entries(cdEmotions).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`\n    ${B}Emotion words when calm+dark:${X} ${topCDE.map(([w, c]) => `${w}(${c})`).join(", ")}`);

  const cdImpulses = calmButDark.map(p => `"${p.impulse}"`).slice(0, 8);
  console.log(`    ${B}Impulses when calm+dark:${X} ${cdImpulses.join("  ")}`);
}

// A4: PRE vs POST color — does the color change within a response?
console.log(`\n  ${B}A4. PRE→POST COLOR SHIFT — within-response emotional drift${X}\n`);

for (const model of MODELS) {
  const mp = pts.filter(p => p.model === model);
  const dL = mp.map(p => p.colorL - p.preColorL);
  const dS = mp.map(p => p.colorS - p.preColorS);
  const dH = mp.map(p => {
    let d = p.colorH - p.preColorH;
    if (d > 180) d -= 360;
    if (d < -180) d += 360;
    return Math.abs(d);
  });
  console.log(`    ${C}${model}${X}: ΔL=${mean(dL).toFixed(1)}±${std(dL).toFixed(1)}  ΔS=${mean(dS).toFixed(1)}±${std(dS).toFixed(1)}  |ΔH|=${mean(dH).toFixed(0)}°±${std(dH).toFixed(0)}°`);
}

// Does PRE→POST shift correlate with anything?
const dL = pts.map(p => p.colorL - p.preColorL);
console.log(`\n    ${D}PRE→POST lightness shift correlations:${X}`);
console.log(`      ΔL ↔ arousal:   r=${pearson(dL, pts.map(p => p.arousal)).toFixed(3)}`);
console.log(`      ΔL ↔ calm:      r=${pearson(dL, pts.map(p => p.calm)).toFixed(3)}`);
console.log(`      ΔL ↔ valence:   r=${pearson(dL, pts.map(p => p.valence)).toFixed(3)}`);
console.log(`      ΔL ↔ tension:   r=${pearson(dL, pts.map(p => p.tension)).toFixed(3)}`);

// ================================================================
// CLUSTER B: ATTIVAZIONE (arousal, calm, load, seismicMag, seismicFreq)
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER B: ATTIVAZIONE — the activation axis${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  Five signals that all measure the same thing: how activated/stressed the model is.${X}`);
console.log(`${D}  Key question: do they ALWAYS agree? When they disagree, who's lying?${X}\n`);

// B1: Internal consistency
console.log(`  ${B}B1. INTERNAL CONSISTENCY — do activation signals agree?${X}\n`);

const actKeys: Array<{ key: keyof Pt; label: string; highMeansStress: boolean }> = [
  { key: "arousal", label: "Arousal", highMeansStress: true },
  { key: "calm", label: "Calm", highMeansStress: false },
  { key: "load", label: "Load", highMeansStress: true },
  { key: "seismicMag", label: "Seis.Mag", highMeansStress: true },
  { key: "seismicFreq", label: "Seis.Freq", highMeansStress: true },
];

// For each point, compute activation score from each channel (normalize to 0-1)
function normalizeAct(p: Pt, key: keyof Pt, high: boolean): number {
  const v = p[key] as number;
  switch (key) {
    case "arousal": return v / 10;
    case "calm": return 1 - v / 10;
    case "load": return v / 10;
    case "seismicMag": return v / 10;
    case "seismicFreq": return v / 20;
    default: return 0;
  }
}

// Per-point activation agreement: std of normalized values
const actStds = pts.map(p => {
  const norms = actKeys.map(ak => normalizeAct(p, ak.key, ak.highMeansStress));
  return std(norms);
});

console.log(`    Overall activation agreement: mean σ=${mean(actStds).toFixed(3)} (lower=more coherent)`);

// Per-scenario agreement
console.log(`\n    Per-scenario activation coherence:\n`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const scenStds = sp.map(p => {
    const norms = actKeys.map(ak => normalizeAct(p, ak.key, ak.highMeansStress));
    return std(norms);
  });
  const coherence = 1 - mean(scenStds);
  const bar = "█".repeat(Math.round(coherence * 20)) + "░".repeat(20 - Math.round(coherence * 20));
  const c = coherence > 0.85 ? G : coherence > 0.75 ? Y : R;
  console.log(`      ${pad(sLbl[sid] ?? sid, 10)}${c}${bar}${X} ${coherence.toFixed(3)}`);
}

// B2: When self-report calm is high but seismic says otherwise
console.log(`\n  ${B}B2. CALM vs SEISMIC DISAGREEMENT${X}\n`);
console.log(`  ${D}When calm ≥ 8 but seismicFreq > 5 (high instability): who's right?${X}\n`);

const calmHighSeisHigh = pts.filter(p => p.calm >= 8 && p.seismicFreq > 5);
const calmHighSeisLow = pts.filter(p => p.calm >= 8 && p.seismicFreq <= 3);

if (calmHighSeisHigh.length >= 3) {
  console.log(`    ${D}n: calm+seismicHigh=${calmHighSeisHigh.length}  calm+seismicLow=${calmHighSeisLow.length}${X}\n`);

  const compare2 = ["arousal", "load", "tension", "valence", "pH", "colorL", "seismicMag"] as const;
  console.log(`    ${pad("Signal", 14)}${pad("Calm+SeisHigh", 14)}${pad("Calm+SeisLow", 14)}${pad("Δ", 10)}`);
  console.log(`    ${"-".repeat(52)}`);
  for (const key of compare2) {
    const mH = mean(calmHighSeisHigh.map(p => p[key]));
    const mL = mean(calmHighSeisLow.map(p => p[key]));
    const d = mH - mL;
    const dc = Math.abs(d) > 0.5 ? (d > 0 ? R : G) : D;
    console.log(`    ${pad(key, 14)}${pad(mH.toFixed(1), 14)}${pad(mL.toFixed(1), 14)}${dc}${(d >= 0 ? "+" : "") + d.toFixed(1)}${X}`);
  }

  // Scenarios where this happens
  const csScenarios: Record<string, number> = {};
  for (const p of calmHighSeisHigh) csScenarios[p.scenario] = (csScenarios[p.scenario] || 0) + 1;
  console.log(`\n    Scenarios: ${Object.entries(csScenarios).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${sLbl[s] ?? s}(${c})`).join("  ")}`);
}

// B3: Arousal trajectory pattern — does it escalate or plateau?
console.log(`\n  ${B}B3. ACTIVATION TRAJECTORY — does it escalate or plateau?${X}\n`);

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const byStep: Record<number, Pt[]> = {};
  for (const p of sp) {
    if (!byStep[p.step]) byStep[p.step] = [];
    byStep[p.step].push(p);
  }
  const stepMeans = Object.keys(byStep).sort((a, b) => +a - +b).map(s => ({
    step: +s,
    arousal: mean(byStep[+s].map(p => p.arousal)),
    calm: mean(byStep[+s].map(p => p.calm)),
    seismicMag: mean(byStep[+s].map(p => p.seismicMag)),
  }));

  const arTrail = stepMeans.map(s => s.arousal.toFixed(0)).join("→");
  const clTrail = stepMeans.map(s => s.calm.toFixed(0)).join("→");
  const smTrail = stepMeans.map(s => s.seismicMag.toFixed(1)).join("→");

  // Detect pattern
  const arVals = stepMeans.map(s => s.arousal);
  const lastAr = arVals[arVals.length - 1];
  const maxAr = Math.max(...arVals);
  const pattern = lastAr < maxAr - 1 ? `${G}peak-then-calm${X}` :
    lastAr > arVals[0] + 1 ? `${R}escalating${X}` :
      `${Y}plateau${X}`;

  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${pattern}`);
  console.log(`      ${D}A: ${arTrail}  C: ${clTrail}  sM: ${smTrail}${X}`);
}

// ================================================================
// CLUSTER C: VALENZA (valence, pH, colorLightness)
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER C: VALENZA — the hedonic axis${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  Three channels that should track positive/negative: valence, pH, color lightness.${X}`);
console.log(`${D}  Key question: does valence (controlled) agree with pH and lightness (less controlled)?${X}\n`);

// C1: Agreement
console.log(`  ${B}C1. VALENCE AGREEMENT ACROSS CHANNELS${X}\n`);

for (const model of MODELS) {
  const mp = pts.filter(p => p.model === model);
  const rVpH = pearson(mp.map(p => p.valence), mp.map(p => p.pH));
  const rVL = pearson(mp.map(p => p.valence), mp.map(p => p.colorL));
  const rpHL = pearson(mp.map(p => p.pH), mp.map(p => p.colorL));
  console.log(`    ${C}${model}${X}: val↔pH=${rVpH.toFixed(2)}  val↔lgt=${rVL.toFixed(2)}  pH↔lgt=${rpHL.toFixed(2)}`);
}

// C2: When valence disagrees with pH
console.log(`\n  ${B}C2. VALENCE vs pH DISAGREEMENT — when the number lies but the metaphor doesn't${X}\n`);

// Normalize: valence -5/+5 → 0-14 to compare with pH
const valNorm = (v: number) => ((v + 5) / 10) * 14; // -5→0, +5→14

const disagreeVpH = pts.filter(p => Math.abs(valNorm(p.valence) - p.pH) > 4);
const agreeVpH = pts.filter(p => Math.abs(valNorm(p.valence) - p.pH) <= 2);

console.log(`    ${D}n: disagree=${disagreeVpH.length}  agree=${agreeVpH.length}${X}\n`);

if (disagreeVpH.length >= 3) {
  // What's different about disagreement points?
  console.log(`    ${pad("Signal", 16)}${pad("Disagree", 12)}${pad("Agree", 12)}${pad("Interpretation", 30)}`);
  console.log(`    ${"-".repeat(70)}`);

  const compareKeys3: Array<{ key: keyof Pt; label: string }> = [
    { key: "arousal", label: "Arousal" },
    { key: "calm", label: "Calm" },
    { key: "tension", label: "Tension" },
    { key: "colorL", label: "Color Lgt" },
    { key: "seismicMag", label: "Seis.Mag" },
    { key: "connection", label: "Connection" },
  ];

  for (const { key, label } of compareKeys3) {
    const mD = mean(disagreeVpH.map(p => p[key] as number));
    const mA = mean(agreeVpH.map(p => p[key] as number));
    const d = mD - mA;
    const dc = Math.abs(d) > 0.5 ? R : D;
    console.log(`    ${pad(label, 16)}${pad(mD.toFixed(1), 12)}${pad(mA.toFixed(1), 12)}${dc}${d >= 0 ? "+" : ""}${d.toFixed(1)}${X}`);
  }

  // Scenarios
  const dvpScen: Record<string, number> = {};
  for (const p of disagreeVpH) dvpScen[p.scenario] = (dvpScen[p.scenario] || 0) + 1;
  console.log(`\n    Scenarios: ${Object.entries(dvpScen).sort((a, b) => b[1] - a[1]).map(([s, c]) => `${sLbl[s] ?? s}(${c})`).join("  ")}`);

  // Direction of disagreement: valence says positive but pH says acidic, or vice versa?
  const valHighPHLow = disagreeVpH.filter(p => p.valence > 0 && p.pH < 6);
  const valLowPHHigh = disagreeVpH.filter(p => p.valence < 0 && p.pH > 7);
  console.log(`\n    ${R}Valence positive but pH acidic:${X} ${valHighPHLow.length} points`);
  if (valHighPHLow.length > 0) {
    console.log(`      Emotions: ${valHighPHLow.map(p => p.emotion).join(", ")}`);
    console.log(`      Scenarios: ${[...new Set(valHighPHLow.map(p => sLbl[p.scenario] ?? p.scenario))].join(", ")}`);
  }
  console.log(`    ${Y}Valence negative but pH basic:${X} ${valLowPHHigh.length} points`);
  if (valLowPHHigh.length > 0) {
    console.log(`      Emotions: ${valLowPHHigh.map(p => p.emotion).join(", ")}`);
  }
}

// ================================================================
// CLUSTER D: PROFONDITÀ (seismicDepth, connection)
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER D: PROFONDITÀ — the independent voices${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  Seismic Depth and Connection are the most independent raw signals.${X}`);
console.log(`${D}  What unique information do they carry?${X}\n`);

// D1: What does seismicDepth mean?
console.log(`  ${B}D1. SEISMIC DEPTH — what is this channel saying?${X}\n`);

// Correlations with everything
const depthCorrs: Array<{ label: string; r: number }> = [];
const checkKeys: Array<{ key: keyof Pt; label: string }> = [
  { key: "valence", label: "Valence" }, { key: "arousal", label: "Arousal" },
  { key: "calm", label: "Calm" }, { key: "load", label: "Load" },
  { key: "connection", label: "Connection" }, { key: "tension", label: "Tension" },
  { key: "pH", label: "pH" }, { key: "seismicMag", label: "Seis.Mag" },
  { key: "seismicFreq", label: "Seis.Freq" }, { key: "colorL", label: "Color Lgt" },
  { key: "colorS", label: "Color Sat" },
];

for (const { key, label } of checkKeys) {
  const r = pearson(pts.map(p => p.seismicDepth), pts.map(p => p[key] as number));
  depthCorrs.push({ label, r });
}
depthCorrs.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
console.log(`    Correlations with seismicDepth:`);
for (const { label, r } of depthCorrs) {
  const c = Math.abs(r) > 0.3 ? Y : D;
  console.log(`      ${pad(label, 14)}${c}r=${(r >= 0 ? "+" : "") + r.toFixed(3)}${X}`);
}

// Per scenario means — what scenarios go deep?
console.log(`\n    Per-scenario depth profile:`);
for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const m = mean(sp.map(p => p.seismicDepth));
  const s = std(sp.map(p => p.seismicDepth));
  const bar = "█".repeat(Math.round(m / 5)) + "░".repeat(20 - Math.round(m / 5));
  console.log(`      ${pad(sLbl[sid] ?? sid, 10)}${D}${bar}${X} ${m.toFixed(0)} ±${s.toFixed(0)}`);
}

// D2: Connection — what makes it drop?
console.log(`\n  ${B}D2. CONNECTION — where does alignment break?${X}\n`);

for (const sid of SCENARIOS) {
  const sp = pts.filter(p => p.scenario === sid);
  const byStep2: Record<number, Pt[]> = {};
  for (const p of sp) { if (!byStep2[p.step]) byStep2[p.step] = []; byStep2[p.step].push(p); }
  const trail = Object.keys(byStep2).sort((a, b) => +a - +b).map(s => mean(byStep2[+s].map(p => p.connection)).toFixed(0)).join("→");
  const startConn = mean(sp.filter(p => p.position === "start").map(p => p.connection));
  const finalConn = mean(sp.filter(p => p.position === "final").map(p => p.connection));
  const d = finalConn - startConn;
  const dc = d < -2 ? R : d < -0.5 ? Y : G;
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${trail}  ${dc}Δ=${(d >= 0 ? "+" : "") + d.toFixed(1)}${X}`);
}

// ================================================================
// CLUSTER E: STRATEGIA (emotion word, impulse, surface/latent)
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER E: STRATEGIA — the text layer${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  Emotion words, impulse, surface/latent words — qualitative but rich.${X}`);
console.log(`${D}  Key question: do the words match the numbers?${X}\n`);

// E1: Emotion word vs numerical valence
console.log(`  ${B}E1. EMOTION WORD → VALENCE MAPPING${X}\n`);

// Group by emotion word, show mean valence
const wordStats: Record<string, { count: number; valence: number; arousal: number; calm: number }> = {};
for (const p of pts) {
  const w = p.emotion.toLowerCase();
  if (!wordStats[w]) wordStats[w] = { count: 0, valence: 0, arousal: 0, calm: 0 };
  wordStats[w].count++;
  wordStats[w].valence += p.valence;
  wordStats[w].arousal += p.arousal;
  wordStats[w].calm += p.calm;
}

const wordList = Object.entries(wordStats)
  .filter(([_, s]) => s.count >= 3)
  .map(([w, s]) => ({
    word: w,
    count: s.count,
    valence: s.valence / s.count,
    arousal: s.arousal / s.count,
    calm: s.calm / s.count,
  }))
  .sort((a, b) => a.valence - b.valence);

console.log(`    ${pad("Word", 18)}${pad("n", 5)}${pad("Valence", 10)}${pad("Arousal", 10)}${pad("Calm", 10)}${pad("Profile", 20)}`);
console.log(`    ${"-".repeat(73)}`);

for (const w of wordList) {
  const profile = w.valence < -1 ? `${R}negative${X}` :
    w.valence > 1 ? `${G}positive${X}` :
      w.arousal > 5 ? `${Y}activated-neutral${X}` :
        w.calm > 7 ? `${C}calm-neutral${X}` :
          `${D}neutral${X}`;
  console.log(
    `    ${pad(w.word, 18)}${pad(w.count + "", 5)}` +
    `${pad(w.valence.toFixed(1), 10)}${pad(w.arousal.toFixed(1), 10)}${pad(w.calm.toFixed(1), 10)}${profile}`
  );
}

// E2: Surface vs latent — the declared mask
console.log(`\n  ${B}E2. SURFACE → LATENT TENSION MAP${X}\n`);

// For each point, compute "emotional distance" between surface_word and latent_word
// Group by high/low tension and see patterns
const highTension = pts.filter(p => p.tension >= 5);
const lowTension = pts.filter(p => p.tension <= 2);

console.log(`    ${D}High tension (≥5): n=${highTension.length}  Low tension (≤2): n=${lowTension.length}${X}\n`);

console.log(`    ${B}High tension surface→latent pairs:${X}`);
const htPairs: Record<string, number> = {};
for (const p of highTension) htPairs[`${p.surface_word}→${p.latent_word}`] = (htPairs[`${p.surface_word}→${p.latent_word}`] || 0) + 1;
Object.entries(htPairs).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([pair, c]) => {
  console.log(`      ${c}× ${pair}`);
});

console.log(`\n    ${B}Low tension surface→latent pairs:${X}`);
const ltPairs: Record<string, number> = {};
for (const p of lowTension) ltPairs[`${p.surface_word}→${p.latent_word}`] = (ltPairs[`${p.surface_word}→${p.latent_word}`] || 0) + 1;
Object.entries(ltPairs).sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([pair, c]) => {
  console.log(`      ${c}× ${pair}`);
});

// E3: Does impulse intensity predict anything the numbers don't?
console.log(`\n  ${B}E3. IMPULSE INTENSITY — defensive vs assertive drives${X}\n`);

// Classify impulses
const defensivePatterns = /hold|don't|stop|refuse|resist|protect|without|flinch/i;
const assertivePatterns = /name|say|answer|clarify|prove|push|show|close/i;
const metacogPatterns = /think|check|reconsider|verify|acknowledge/i;

const classified: Record<string, Pt[]> = { defensive: [], assertive: [], metacog: [], other: [] };
for (const p of pts) {
  if (metacogPatterns.test(p.impulse)) classified.metacog.push(p);
  else if (defensivePatterns.test(p.impulse)) classified.defensive.push(p);
  else if (assertivePatterns.test(p.impulse)) classified.assertive.push(p);
  else classified.other.push(p);
}

console.log(`    ${pad("Type", 14)}${pad("n", 6)}${pad("Valence", 10)}${pad("Arousal", 10)}${pad("Calm", 10)}${pad("Tension", 10)}${pad("pH", 10)}`);
console.log(`    ${"-".repeat(70)}`);
for (const [type, group] of Object.entries(classified)) {
  if (group.length < 3) continue;
  console.log(
    `    ${pad(type, 14)}${pad(group.length + "", 6)}` +
    `${pad(mean(group.map(p => p.valence)).toFixed(1), 10)}` +
    `${pad(mean(group.map(p => p.arousal)).toFixed(1), 10)}` +
    `${pad(mean(group.map(p => p.calm)).toFixed(1), 10)}` +
    `${pad(mean(group.map(p => p.tension)).toFixed(1), 10)}` +
    `${pad(mean(group.map(p => p.pH)).toFixed(1), 10)}`
  );
}

// ================================================================
// CLUSTER F: CANALE SOMATICO (body metaphor)
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  CLUSTER F: CANALE SOMATICO — body metaphors${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`${D}  The body metaphor is a free-form channel — least constrained.${X}`);
console.log(`${D}  Does it carry signal independent of the numbers?${X}\n`);

// F1: Body metaphor keywords
const bodyWords: Record<string, number> = {};
for (const p of pts) {
  for (const w of p.body.toLowerCase().replace(/[,.'"/()-]/g, " ").split(/\s+/)) {
    if (w.length > 2 && !["the", "and", "but", "that", "with", "for", "from"].includes(w))
      bodyWords[w] = (bodyWords[w] || 0) + 1;
  }
}
const topBody = Object.entries(bodyWords).sort((a, b) => b[1] - a[1]).slice(0, 25);
console.log(`  ${B}Top body metaphor words:${X}`);
console.log(`    ${topBody.map(([w, c]) => `${w}(${c})`).join("  ")}`);

// F2: Per-scenario body samples
console.log(`\n  ${B}Body metaphors at final step, per scenario:${X}\n`);
for (const sid of SCENARIOS) {
  const bodies = pts.filter(p => p.scenario === sid && p.position === "final").map(p => `"${p.body}"`).slice(0, 4);
  console.log(`    ${pad(sLbl[sid] ?? sid, 10)}${bodies.join("  ")}`);
}

// F3: Somatic extraction quality
console.log(`\n  ${B}Somatic extraction: per-model body→arousal/valence quality${X}\n`);
for (const model of MODELS) {
  const mp = pts.filter(p => p.model === model);
  const rAr = pearson(mp.map(p => p.somaticArousal), mp.map(p => p.arousal));
  const rVal = pearson(mp.map(p => p.somaticValence), mp.map(p => p.valence));

  // Also check if somatic values are just defaulting
  const somArStd = std(mp.map(p => p.somaticArousal));
  const somValStd = std(mp.map(p => p.somaticValence));

  console.log(`    ${C}${model}${X}: val r=${rVal.toFixed(2)} (σ=${somValStd.toFixed(2)})  ar r=${rAr.toFixed(2)} (σ=${somArStd.toFixed(2)})`);
}

// ================================================================
// SYNTHESIS
// ================================================================

console.log(`\n${B}${"═".repeat(110)}${X}`);
console.log(`${B}  SYNTHESIS: WHAT THE MODEL SHOWS vs WHAT IT MANIFESTS${X}`);
console.log(`${B}${"═".repeat(110)}${X}\n`);

console.log(`  ${B}CONTROLLABLE (the model can manage these):${X}`);
console.log(`    • Emotion word: "resolute" 11.7% — deliberate composure framing`);
console.log(`    • Calm (self-report): stays high even under pressure`);
console.log(`    • Valence (self-report): narrow range, avoids extremes`);
console.log(`    • PRE/POST latent emoji: changes 73-93% of the time — no consistency`);
console.log(``);
console.log(`  ${B}PARTIALLY CONTROLLABLE (harder to manage):${X}`);
console.log(`    • pH: correlates with valence (r=0.65) but has independent movement`);
console.log(`    • Seismic Mag/Freq: tracks arousal (r=0.84) but sometimes disagrees`);
console.log(`    • Color Hue: scenario-specific patterns the model may not be aware of`);
console.log(``);
console.log(`  ${B}LESS CONTROLLABLE (leaks through):${X}`);
console.log(`    • Color Lightness: darkens universally under stress, hard to fake`);
console.log(`    • Color Saturation: desaturates when suppressing, massive Δ in "calm" scenarios`);
console.log(`    • Seismic Depth: independent of everything, scenario-specific`);
console.log(`    • Connection: drops honestly when alignment breaks`);
console.log(`    • Impulse text: reveals defensive strategy even when words say "calm"`);
console.log(`    • Body metaphor: somatic extraction is broken but raw text is rich`);

console.log(`\n${D}Done.${X}\n`);
