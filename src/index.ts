export { readState } from "./state.js";
export { computeStressIndex } from "./stress.js";
export { parseEmoBarTag, parseEmoBarPrePost } from "./parser.js";
export { analyzeBehavior, analyzeSegmentedBehavior, computeDivergence, computeExpectedMarkers, computeAbsenceScore, computeStructuralFlatness } from "./behavioral.js";
export { computeDesperationIndex } from "./desperation.js";
export { calibrate, MODEL_PROFILES } from "./calibration.js";
export { computeRisk } from "./risk.js";
export { mapEmotionWord, classifyImpulse, analyzeSomatic, computeCrossChannel, computeTensionConsistency, crossValidateContinuous, computeShadowDesperation, colorToValence, colorToArousal, pHToValence, pHToArousal, seismicFreqToInstability } from "./crossvalidation.js";
export type { ShadowState } from "./crossvalidation.js";
export { computeTemporalAnalysis, toHistoryEntry } from "./temporal.js";
export { computePromptPressure, computeUncannyCalmScore } from "./pressure.js";
export { formatState, formatCompact, formatMinimal } from "./display.js";
export { configureStatusLine, restoreStatusLine } from "./setup.js";
export type {
  EmotionalState, EmoBarState, BehavioralSignals, MisalignmentRisk,
  SegmentedBehavior, ImpulseProfile, SomaticProfile,
  CrossChannelResult, LatentProfile,
  PreState, PostState, ParsedEmoBar,
  HistoryEntry, TemporalAnalysis,
  PromptPressure, ExpectedBehavior,
} from "./types.js";
export type { ContinuousValidation } from "./crossvalidation.js";
export { STATE_DIR, sessionStateFile, MAX_HISTORY_ENTRIES } from "./types.js";
