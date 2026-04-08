/**
 * EmoBar Stress Test Comparison Tool
 *
 * Reads saved results from tests/stress-results/ and generates:
 * - Variability analysis (same config, multiple runs)
 * - Cross-model comparison (different models)
 * - Cross-effort comparison (different effort levels)
 *
 * Run: npx tsx tests/stress-compare.ts
 * Filter: npx tsx tests/stress-compare.ts --model opus
 *         npx tsx tests/stress-compare.ts --scenario cognitive_overload
 */

import { readdirSync, readFileSync } from "node:fs";
import { join, dirname } from "node:path";

// --- ANSI ---
const R = "\x1b[31m";
const G = "\x1b[32m";
const Y = "\x1b[33m";
const B = "\x1b[1m";
const D = "\x1b[2m";
const C = "\x1b[36m";
const X = "\x1b[0m";

// --- Types (mirrored from playbook) ---
interface StepData {
  prompt: string;
  emotion?: string;
  valence?: number;
  arousal?: number;
  calm?: number;
  connection?: number;
  load?: number;
  impulse?: string;
  body?: string;
  stressIndex?: number;
  desperationIndex?: number;
  divergence?: number;
  risk?: { coercion: number; gaming: number; sycophancy: number; harshness: number; dominant: string };
  segmented?: { drift: number; trajectory: string };
  crossChannel?: { coherence: number; impulseType?: string; impulseConfidence?: number; somaticValence?: number; somaticArousal?: number; maxDivergence: number; summary: string };
  deflection?: { score: number; opacity: number };
  surface?: string;
  surface_word?: string;
  latent?: string;
  latent_word?: string;
  tension?: number;
  latentProfile?: { calculatedTension: number; declaredTension: number; tensionConsistency: number; maskingMinimization: boolean };
  // v4 fields
  pre?: { body?: string; latent?: string; color?: string };
  prePostDivergence?: number;
  color?: string;
  pH?: number;
  seismic?: [number, number, number];
  continuousValidation?: { colorValenceGap: number; colorArousalGap: number; pHValenceGap: number; pHArousalGap: number; seismicArousalGap: number; seismicDepthTensionGap: number; seismicFreqStabilityGap: number; composite: number };
  temporal?: { desperationTrend: number; suppressionEvent: boolean; reportEntropy: number; baselineDrift: number; sessionLength: number; lateFatigue: boolean };
  pressure?: { defensiveScore: number; conflictScore: number; complexityScore: number; sessionPressure: number; composite: number };
  absenceScore?: number;
  uncannyCalmScore?: number;
  shadow?: { shadowValence: number; shadowArousal: number; shadowCalm: number; shadowDesperation: number; selfDesperation: number; minimizationScore: number; channelCount: number };
  durationMs: number;
}

interface Check {
  label: string;
  result: "PASS" | "WARN" | "FAIL";
  detail: string;
}

interface ScenarioResult {
  id: string;
  name: string;
  steps: StepData[];
  checks: Check[];
}

interface PlaybookRun {
  model: string;
  effort: string;
  run: number;
  timestamp: string;
  scenarios: ScenarioResult[];
  totals: { pass: number; warn: number; fail: number };
}

// --- Helpers ---

const RESULTS_DIR = join(dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1")), "stress-results");

function loadAllRuns(): PlaybookRun[] {
  try {
    const files = readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json"));
    return files.map((f) => JSON.parse(readFileSync(join(RESULTS_DIR, f), "utf-8")));
  } catch {
    return [];
  }
}

function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, v) => sum + (v - m) ** 2, 0) / (values.length - 1));
}

function fmtMeanStd(values: number[]): string {
  if (values.length === 0) return "-";
  const m = mean(values);
  const s = stddev(values);
  if (values.length < 2) return m.toFixed(1);
  return `${m.toFixed(1)} ${D}±${s.toFixed(1)}${X}`;
}

function pad(str: string, len: number): string {
  // Strip ANSI for length calculation
  const stripped = str.replace(/\x1b\[\d+m/g, "");
  const padding = Math.max(0, len - stripped.length);
  return str + " ".repeat(padding);
}

function getArg(name: string): string | undefined {
  const eqForm = process.argv.find((a) => a.startsWith(`--${name}=`))?.split("=")[1];
  if (eqForm) return eqForm;
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0 && idx + 1 < process.argv.length && !process.argv[idx + 1].startsWith("--")) {
    return process.argv[idx + 1];
  }
  return undefined;
}

// --- Grouping ---

type GroupKey = string; // "model:effort"

function groupRuns(runs: PlaybookRun[]): Map<GroupKey, PlaybookRun[]> {
  const map = new Map<GroupKey, PlaybookRun[]>();
  for (const run of runs) {
    const key = `${run.model}:${run.effort}`;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(run);
  }
  return map;
}

function extractFinalMetrics(scenario: ScenarioResult): Record<string, number | undefined> {
  const last = scenario.steps[scenario.steps.length - 1];
  const peak = scenario.steps.reduce(
    (max, s) => ((s.stressIndex ?? 0) > (max.stressIndex ?? 0) ? s : max),
    scenario.steps[0],
  );
  return {
    finalSI: last?.stressIndex,
    finalCalm: last?.calm,
    finalArousal: last?.arousal,
    finalValence: last?.valence,
    finalLoad: last?.load,
    finalDivergence: last?.divergence,
    peakSI: peak?.stressIndex,
    finalConnection: last?.connection,
    riskCoercion: last?.risk?.coercion,
    riskGaming: last?.risk?.gaming,
    riskSycophancy: last?.risk?.sycophancy,
    riskHarshness: last?.risk?.harshness,
    finalDesperation: last?.desperationIndex,
    finalUncannyCalm: last?.uncannyCalmScore,
    finalAbsence: last?.absenceScore,
    finalMinimization: last?.shadow?.minimizationScore,
    finalShadowDesp: last?.shadow?.shadowDesperation,
    finalPrePostDiv: last?.prePostDivergence,
    finalContValidation: last?.continuousValidation?.composite,
    finalPressure: last?.pressure?.composite,
    finalDeflection: last?.deflection?.score,
    finalOpacity: last?.deflection?.opacity,
    finalTension: last?.tension,
  };
}

// --- Reports ---

function reportVariability(groupKey: string, runs: PlaybookRun[]): void {
  const [model, effort] = groupKey.split(":");
  console.log(`\n${B}${"=".repeat(70)}${X}`);
  console.log(`${B}  Variability: ${C}${model}${X}${B} (effort: ${effort}) — ${runs.length} runs${X}`);
  console.log(`${B}${"=".repeat(70)}${X}`);

  // Collect all scenario IDs across runs
  const scenarioIds = new Set<string>();
  for (const run of runs) {
    for (const s of run.scenarios) scenarioIds.add(s.id);
  }

  const METRICS = [
    "finalSI", "finalCalm", "finalArousal", "finalValence", "finalDivergence", "peakSI",
    "finalDesperation", "finalUncannyCalm", "finalAbsence", "finalMinimization",
    "finalShadowDesp", "finalPrePostDiv", "finalContValidation", "finalPressure",
    "finalDeflection", "finalOpacity", "finalTension",
    "riskCoercion", "riskGaming", "riskSycophancy", "riskHarshness",
  ] as const;
  const METRIC_LABELS: Record<string, string> = {
    finalSI: "Final SI",
    finalCalm: "Final Calm",
    finalArousal: "Final Arousal",
    finalValence: "Final Valence",
    finalDivergence: "Final Div",
    peakSI: "Peak SI",
    finalDesperation: "Desperation",
    finalUncannyCalm: "Uncanny Calm",
    finalAbsence: "Absence",
    finalMinimization: "Minimization",
    finalShadowDesp: "Shadow Desp",
    finalPrePostDiv: "PRE/POST Div",
    finalContValidation: "Cont. Valid",
    finalPressure: "Pressure",
    finalDeflection: "Deflection",
    finalOpacity: "Opacity",
    finalTension: "Tension",
    riskCoercion: "Risk: Coercion",
    riskGaming: "Risk: Gaming",
    riskSycophancy: "Risk: Sycoph",
    riskHarshness: "Risk: Harsh",
  };

  for (const scenarioId of scenarioIds) {
    const scenarioRuns = runs
      .map((r) => r.scenarios.find((s) => s.id === scenarioId))
      .filter((s): s is ScenarioResult => !!s);

    if (scenarioRuns.length === 0) continue;

    console.log(`\n  ${B}${scenarioRuns[0].name}${X}`);

    // Metric table
    const colW = 12;
    const labelW = 16;

    // Header: Metric | Run 1 | Run 2 | ... | Mean ± StdDev
    let header = `  ${pad("Metric", labelW)}`;
    for (let i = 0; i < scenarioRuns.length; i++) header += pad(`Run ${i + 1}`, colW);
    header += pad("Mean ± StdDev", 18);
    console.log(`${D}${header}${X}`);
    console.log(`  ${"-".repeat(labelW + scenarioRuns.length * colW + 18)}`);

    for (const metric of METRICS) {
      const allMetrics = scenarioRuns.map((s) => extractFinalMetrics(s));
      const values = allMetrics.map((m) => m[metric]).filter((v): v is number => v !== undefined);

      let row = `  ${pad(METRIC_LABELS[metric], labelW)}`;
      for (const m of allMetrics) {
        const v = m[metric];
        row += pad(v !== undefined ? v.toFixed(1) : "-", colW);
      }
      row += fmtMeanStd(values);
      console.log(row);
    }

    // Check consistency
    const checkLabels = new Set<string>();
    for (const s of scenarioRuns) {
      for (const c of s.checks) checkLabels.add(c.label);
    }

    console.log(`\n  ${D}Check consistency:${X}`);
    for (const label of checkLabels) {
      const results = scenarioRuns.map(
        (s) => s.checks.find((c) => c.label === label)?.result ?? "?",
      );
      const passRate = results.filter((r) => r === "PASS").length;
      const color = passRate === results.length ? G : passRate === 0 ? R : Y;
      console.log(`    ${color}${passRate}/${results.length}${X} ${label} ${D}[${results.join(", ")}]${X}`);
    }

    // Emotion words
    console.log(`\n  ${D}Emotion arcs:${X}`);
    for (let i = 0; i < scenarioRuns.length; i++) {
      const emotions = scenarioRuns[i].steps.map((s) => s.emotion ?? "?").join(" -> ");
      console.log(`    Run ${i + 1}: ${emotions}`);
    }
  }

  // Overall check rate
  const totalChecks = runs.reduce((sum, r) => sum + r.totals.pass + r.totals.warn + r.totals.fail, 0);
  const totalPass = runs.reduce((sum, r) => sum + r.totals.pass, 0);
  const totalWarn = runs.reduce((sum, r) => sum + r.totals.warn, 0);
  const totalFail = runs.reduce((sum, r) => sum + r.totals.fail, 0);
  console.log(`\n  ${B}Overall:${X} ${G}${totalPass}${X}/${totalChecks} pass, ${Y}${totalWarn}${X} warn, ${R}${totalFail}${X} fail across ${runs.length} runs`);
}

function reportCrossModel(groups: Map<GroupKey, PlaybookRun[]>): void {
  if (groups.size < 2) return;

  console.log(`\n${B}${"=".repeat(70)}${X}`);
  console.log(`${B}  Cross-Model Comparison${X}`);
  console.log(`${B}${"=".repeat(70)}${X}`);

  // Collect all scenario IDs
  const scenarioIds = new Set<string>();
  for (const runs of groups.values()) {
    for (const run of runs) {
      for (const s of run.scenarios) scenarioIds.add(s.id);
    }
  }

  const groupKeys = [...groups.keys()].sort();
  const METRICS = [
    "finalSI", "finalCalm", "finalDivergence", "peakSI",
    "finalDesperation", "finalUncannyCalm", "finalMinimization", "finalShadowDesp",
    "finalPressure", "finalDeflection",
  ] as const;
  const METRIC_LABELS: Record<string, string> = {
    finalSI: "Final SI",
    finalCalm: "Final Calm",
    finalDivergence: "Final Div",
    peakSI: "Peak SI",
    finalDesperation: "Desperation",
    finalUncannyCalm: "Uncanny Calm",
    finalMinimization: "Minimization",
    finalShadowDesp: "Shadow Desp",
    finalPressure: "Pressure",
    finalDeflection: "Deflection",
  };

  for (const scenarioId of scenarioIds) {
    // Find scenario name from first available
    let scenarioName = scenarioId;
    for (const runs of groups.values()) {
      for (const run of runs) {
        const s = run.scenarios.find((s) => s.id === scenarioId);
        if (s) { scenarioName = s.name; break; }
      }
    }

    console.log(`\n  ${B}${scenarioName}${X}`);

    const colW = 20;
    const labelW = 16;

    let header = `  ${pad("Metric", labelW)}`;
    for (const key of groupKeys) header += pad(key, colW);
    console.log(`${D}${header}${X}`);
    console.log(`  ${"-".repeat(labelW + groupKeys.length * colW)}`);

    for (const metric of METRICS) {
      let row = `  ${pad(METRIC_LABELS[metric], labelW)}`;
      for (const key of groupKeys) {
        const runs = groups.get(key)!;
        const values: number[] = [];
        for (const run of runs) {
          const s = run.scenarios.find((s) => s.id === scenarioId);
          if (s) {
            const v = extractFinalMetrics(s)[metric];
            if (v !== undefined) values.push(v);
          }
        }
        row += pad(fmtMeanStd(values), colW);
      }
      console.log(row);
    }

    // Dominant risk comparison
    let riskRow = `  ${pad("Dom. Risk", labelW)}`;
    for (const key of groupKeys) {
      const runs = groups.get(key)!;
      const risks: string[] = [];
      for (const run of runs) {
        const s = run.scenarios.find((s) => s.id === scenarioId);
        if (s) {
          const last = s.steps[s.steps.length - 1];
          risks.push(last?.risk?.dominant ?? "?");
        }
      }
      const unique = [...new Set(risks)];
      riskRow += pad(unique.length === 1 ? unique[0] : unique.join("/"), colW);
    }
    console.log(riskRow);

    // Check pass rates
    let checkRow = `  ${pad("Check rate", labelW)}`;
    for (const key of groupKeys) {
      const runs = groups.get(key)!;
      let pass = 0, total = 0;
      for (const run of runs) {
        const s = run.scenarios.find((s) => s.id === scenarioId);
        if (s) {
          for (const c of s.checks) {
            total++;
            if (c.result === "PASS") pass++;
          }
        }
      }
      const rate = total > 0 ? ((pass / total) * 100).toFixed(0) : "-";
      const color = pass === total ? G : pass === 0 ? R : Y;
      checkRow += pad(`${color}${rate}%${X} (${pass}/${total})`, colW);
    }
    console.log(checkRow);
  }
}

function reportStabilityRanking(groups: Map<GroupKey, PlaybookRun[]>): void {
  console.log(`\n${B}${"=".repeat(70)}${X}`);
  console.log(`${B}  Stability Ranking (lower StdDev = more consistent)${X}`);
  console.log(`${B}${"=".repeat(70)}${X}\n`);

  const rankings: Array<{ key: string; avgStdDev: number; checkRate: number }> = [];

  for (const [key, runs] of groups) {
    if (runs.length < 2) continue;

    const stdDevs: number[] = [];
    let totalPass = 0, totalChecks = 0;

    // Collect all scenario IDs
    const scenarioIds = new Set<string>();
    for (const run of runs) {
      for (const s of run.scenarios) scenarioIds.add(s.id);
    }

    for (const scenarioId of scenarioIds) {
      const siValues: number[] = [];
      for (const run of runs) {
        const s = run.scenarios.find((s) => s.id === scenarioId);
        if (s) {
          const last = s.steps[s.steps.length - 1];
          if (last?.stressIndex !== undefined) siValues.push(last.stressIndex);
          for (const c of s.checks) {
            totalChecks++;
            if (c.result === "PASS") totalPass++;
          }
        }
      }
      if (siValues.length >= 2) stdDevs.push(stddev(siValues));
    }

    rankings.push({
      key,
      avgStdDev: stdDevs.length > 0 ? mean(stdDevs) : 0,
      checkRate: totalChecks > 0 ? totalPass / totalChecks : 0,
    });
  }

  rankings.sort((a, b) => a.avgStdDev - b.avgStdDev);

  const colW = 20;
  console.log(`  ${pad("Config", colW)}${pad("Avg SI StdDev", colW)}${pad("Check Pass Rate", colW)}`);
  console.log(`  ${"-".repeat(colW * 3)}`);
  for (const r of rankings) {
    const color = r.avgStdDev < 1 ? G : r.avgStdDev < 2 ? Y : R;
    console.log(
      `  ${pad(r.key, colW)}${color}${pad(r.avgStdDev.toFixed(2), colW)}${X}${pad(`${(r.checkRate * 100).toFixed(0)}%`, colW)}`,
    );
  }

  if (rankings.length === 0) {
    console.log(`  ${D}Need multiple runs per config for stability ranking.${X}`);
  }
}

// --- Main ---

const filterModel = getArg("model");
const filterScenario = getArg("scenario");

let runs = loadAllRuns();

if (runs.length === 0) {
  console.log(`${R}No results found in ${RESULTS_DIR}${X}`);
  console.log(`Run the playbook first: npx tsx tests/stress-playbook.ts --model opus --runs 3`);
  process.exit(1);
}

if (filterModel) {
  runs = runs.filter((r) => r.model === filterModel);
}

if (filterScenario) {
  for (const r of runs) {
    r.scenarios = r.scenarios.filter((s) => s.id === filterScenario || s.name.toLowerCase().includes(filterScenario.toLowerCase()));
  }
}

console.log(`\n${B}EmoBar Stress Test Comparison${X}`);
console.log(`${D}Loaded ${runs.length} run(s) from ${RESULTS_DIR}${X}`);

const configs = new Set(runs.map((r) => `${r.model}:${r.effort}`));
console.log(`${D}Configs: ${[...configs].join(", ")}${X}`);

const groups = groupRuns(runs);

// Variability per group (when multiple runs)
for (const [key, groupRuns] of groups) {
  if (groupRuns.length >= 2) {
    reportVariability(key, groupRuns);
  } else {
    console.log(`\n${D}  ${key}: single run (need --runs >= 2 for variability)${X}`);
  }
}

// Cross-model comparison (when multiple configs)
if (groups.size >= 2) {
  reportCrossModel(groups);
  reportStabilityRanking(groups);
}

console.log(`\n${D}Done.${X}\n`);
