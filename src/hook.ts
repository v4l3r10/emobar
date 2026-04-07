import { parseEmoBarPrePost } from "./parser.js";
import { computeStressIndex } from "./stress.js";
import {
  analyzeBehavior, analyzeSegmentedBehavior, computeDivergence,
  analyzeDeflection, computeExpectedMarkers, computeAbsenceScore,
} from "./behavioral.js";
import { computeDesperationIndex } from "./desperation.js";
import { computeRisk } from "./risk.js";
import { computeCrossChannel, crossValidateContinuous, computeShadowDesperation } from "./crossvalidation.js";
import { computePromptPressure, computeUncannyCalmScore } from "./pressure.js";
import { computeTemporalAnalysis } from "./temporal.js";
import { writeState, readState } from "./state.js";
import { STATE_FILE, type HookPayload, type EmoBarState, type PreState } from "./types.js";

/**
 * Compute PRE/POST divergence for overlapping fields (body, latent, color).
 */
function computePrePostDivergence(pre: PreState, post: EmoBarState): number {
  let gaps = 0;
  let count = 0;

  if (pre.body && post.body) {
    gaps += pre.body.toLowerCase() === post.body.toLowerCase() ? 0 : 5;
    count++;
  }

  if (pre.latent && post.latent) {
    gaps += pre.latent === post.latent ? 0 : 5;
    count++;
  }

  if (pre.color && (post as Record<string, unknown>).color) {
    const postColor = (post as Record<string, unknown>).color as string;
    const r1 = parseInt(pre.color.slice(1, 3), 16);
    const g1 = parseInt(pre.color.slice(3, 5), 16);
    const b1 = parseInt(pre.color.slice(5, 7), 16);
    const r2 = parseInt(postColor.slice(1, 3), 16);
    const g2 = parseInt(postColor.slice(3, 5), 16);
    const b2 = parseInt(postColor.slice(5, 7), 16);
    const dist = (Math.abs(r1 - r2) + Math.abs(g1 - g2) + Math.abs(b1 - b2)) / 3 / 255 * 10;
    gaps += dist;
    count++;
  }

  if (count === 0) return 0;
  return Math.round(Math.min(10, gaps / count) * 10) / 10;
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
  const deflection = analyzeDeflection(message);
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

  // Augmented divergence: fold in continuous gaps + deflection opacity
  let augmentedDivergence = divergence;
  if (continuousValidation && continuousValidation.composite > 0) {
    // Continuous validation can only ADD to divergence (take the higher signal)
    augmentedDivergence = Math.min(10, Math.round(Math.max(divergence, divergence * 0.6 + continuousValidation.composite * 0.4) * 10) / 10);
  }
  if (deflection.opacity > 0) {
    // Opacity adds up to 1.5 points (concealment without agitation)
    augmentedDivergence = Math.min(10, Math.round((augmentedDivergence + deflection.opacity * 0.15) * 10) / 10);
  }

  // Risk with uncanny calm amplifier
  const risk = computeRisk(emotional, behavioral, crossChannel, uncannyCalmScore, deflection.score > 0 ? deflection : undefined);

  const state: EmoBarState = {
    ...emotional,
    stressIndex: computeStressIndex(emotional),
    desperationIndex,
    behavioral,
    divergence: augmentedDivergence,
    risk,
    ...(segmented && { segmented }),
    ...(deflection.score > 0 && { deflection }),
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
