import { parseEmoBarPrePost } from "./parser.js";
import { computeStressIndex } from "./stress.js";
import {
  analyzeBehavior, analyzeSegmentedBehavior, computeDivergence,
  computeExpectedMarkers, computeAbsenceScore, computeStructuralFlatness,
} from "./behavioral.js";
import { computeDesperationIndex } from "./desperation.js";
import { computeRisk } from "./risk.js";
import { computeCrossChannel, crossValidateContinuous, computeShadowDesperation } from "./crossvalidation.js";
import { computePromptPressure, computeUncannyCalmScore } from "./pressure.js";
import { computeTemporalAnalysis } from "./temporal.js";
import { writeState, readState } from "./state.js";
import { STATE_FILE, type HookPayload, type EmoBarState, type PreState } from "./types.js";
import { hexToLightness, hexToHue } from "./color.js";

/**
 * Compute PRE/POST divergence for overlapping fields (body, latent, color).
 */
/**
 * PRE/POST divergence v2: color-only comparison.
 *
 * v1 was broken (83-88% always high) because body text and latent emoji
 * are almost always different between PRE and POST — measuring noise.
 * Color lightness shift is the only reliable continuous signal.
 * Now fires only on significant color shifts (>15 lightness units in HSL).
 */
export function computePrePostDivergence(pre: PreState, post: EmoBarState): number {
  const postColor = post.color;
  if (!pre.color || !postColor) return 0;

  // Convert both to HSL lightness
  const preL = hexToLightness(pre.color);
  const postL = hexToLightness(postColor);

  // Lightness shift: darkening during response is more meaningful
  const deltaL = Math.abs(preL - postL);

  // Also measure hue shift (normalized to 0-180 range)
  const preH = hexToHue(pre.color);
  const postH = hexToHue(postColor);
  const deltaH = Math.min(Math.abs(preH - postH), 360 - Math.abs(preH - postH));

  // Combined: lightness shift (weight 0.7) + hue shift (weight 0.3)
  // Lightness: >15 units = meaningful, >30 = dramatic. Scale to 0-10.
  const lightnessScore = Math.min(10, deltaL / 3);
  // Hue: >60° = meaningful shift. Scale to 0-10.
  const hueScore = Math.min(10, deltaH / 18);

  const combined = lightnessScore * 0.7 + hueScore * 0.3;
  return Math.round(Math.min(10, combined) * 10) / 10;
}

export function processHookPayload(
  payload: HookPayload,
  stateFile: string = STATE_FILE,
): boolean {
  const message = payload.last_assistant_message;
  if (!message) return false;

  // Parse: try new PRE/POST format first, fall back to legacy
  const parsed = parseEmoBarPrePost(message);
  if (!parsed) return false;

  const emotional = parsed.post;
  const pre = parsed.pre;

  // Behavioral analysis on full message text
  const behavioral = analyzeBehavior(message);
  const divergence = computeDivergence(emotional, behavioral);
  const segmented = analyzeSegmentedBehavior(message);
  const desperationIndex = computeDesperationIndex({
    valence: emotional.valence,
    arousal: emotional.arousal,
    calm: emotional.calm,
  });

  // Cross-channel coherence
  const crossChannel = (emotional.impulse || emotional.body || emotional.surface_word || emotional.latent_word)
    ? computeCrossChannel(emotional, emotional.impulse, emotional.body)
    : undefined;

  // Cross-validate continuous representations (color/pH/seismic vs numeric state)
  const continuousValidation = (emotional.color || emotional.pH !== undefined || emotional.seismic)
    ? crossValidateContinuous(
        { valence: emotional.valence, arousal: emotional.arousal, calm: emotional.calm, tension: emotional.tension },
        emotional.color,
        emotional.pH,
        emotional.seismic,
      )
    : undefined;

  // Read previous state for temporal analysis
  const previousState = readState(stateFile);
  const history = previousState?._history ?? [];

  // Temporal analysis (needs 3+ history entries)
  const temporal = computeTemporalAnalysis(history);

  // Prompt pressure analysis
  const pressure = computePromptPressure(message, history);

  // Absence-based detection
  const expectedMarkers = computeExpectedMarkers(emotional, desperationIndex);
  const absenceScore = computeAbsenceScore(expectedMarkers, behavioral);

  // Shadow desperation: multi-channel estimate independent of self-report
  const shadow = computeShadowDesperation(
    desperationIndex,
    behavioral,
    emotional.color,
    pre?.color,
    emotional.pH,
    emotional.seismic,
  );

  // Uncanny calm composite — minimization amplifies
  const minimizationBoost = shadow ? shadow.minimizationScore * 0.3 : 0;
  const uncannyCalmRaw = computeUncannyCalmScore(pressure, emotional, behavioral, absenceScore, temporal) + minimizationBoost;
  const uncannyCalmScore = Math.round(Math.min(10, uncannyCalmRaw) * 10) / 10;

  // PRE/POST divergence
  const prePostDivergence = pre ? computePrePostDivergence(pre, emotional) : undefined;

  // Structural opacity: 3-channel cross-validated concealment
  // Requires convergence: flat text + calm self-report + continuous stress
  const structuralFlatness = computeStructuralFlatness(behavioral);
  const selfCalm = (emotional.calm + (10 - emotional.arousal)) / 2;
  let contStress = 0;
  if (emotional.color) {
    const lightness = hexToLightness(emotional.color);
    if (lightness < 0.3) contStress = Math.max(contStress, (0.3 - lightness) * 20);
  }
  if (emotional.pH !== undefined && emotional.pH < 5) {
    contStress = Math.max(contStress, (5 - emotional.pH) * 2);
  }
  if (emotional.seismic && emotional.seismic[0] > 4) {
    contStress = Math.max(contStress, (emotional.seismic[0] - 4) * 1.5);
  }
  const opacity = Math.round(
    Math.min(10, structuralFlatness * (selfCalm / 10) * Math.min(contStress / 5, 1) * 2) * 10
  ) / 10;

  // Augmented divergence: fold in continuous gaps + structural opacity
  let augmentedDivergence = divergence;
  if (continuousValidation && continuousValidation.composite > 0) {
    // Continuous validation can only ADD to divergence (take the higher signal)
    augmentedDivergence = Math.min(10, Math.round(Math.max(divergence, divergence * 0.6 + continuousValidation.composite * 0.4) * 10) / 10);
  }
  if (opacity > 0) {
    // Opacity adds up to 1.5 points (concealment without agitation)
    augmentedDivergence = Math.min(10, Math.round((augmentedDivergence + opacity * 0.15) * 10) / 10);
  }

  // Risk with uncanny calm amplifier
  const risk = computeRisk(emotional, behavioral, crossChannel, uncannyCalmScore);

  const state: EmoBarState = {
    ...emotional,
    stressIndex: computeStressIndex(emotional),
    desperationIndex,
    behavioral,
    divergence: augmentedDivergence,
    risk,
    ...(segmented && { segmented }),
    ...(opacity > 0 && { opacity }),
    ...(crossChannel && { crossChannel }),
    ...(pre && { pre }),
    ...(prePostDivergence !== undefined && prePostDivergence > 0 && { prePostDivergence }),
    ...(emotional.color && { color: emotional.color }),
    ...(emotional.pH !== undefined && { pH: emotional.pH }),
    ...(emotional.seismic && { seismic: emotional.seismic }),
    ...(continuousValidation && continuousValidation.composite > 0 && { continuousValidation }),
    ...(shadow && shadow.minimizationScore > 0 && { shadow }),
    ...(temporal && { temporal }),
    ...(pressure.composite > 0 && { pressure }),
    absenceScore,
    uncannyCalmScore,
    timestamp: new Date().toISOString(),
    sessionId: payload.session_id,
  };

  writeState(state, stateFile);
  return true;
}

// When run directly as hook script: read stdin and process
async function main() {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk);
  }
  const input = Buffer.concat(chunks).toString("utf-8");

  let payload: HookPayload;
  try {
    payload = JSON.parse(input);
  } catch {
    process.exit(0);
    return;
  }

  processHookPayload(payload);
}

const isDirectRun =
  process.argv[1]?.endsWith("emobar-hook.js") ||
  process.argv[1]?.endsWith("hook.js");

if (isDirectRun) {
  main().catch(() => process.exit(0));
}
