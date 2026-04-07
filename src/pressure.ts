import type { HistoryEntry, PromptPressure, EmotionalState, BehavioralSignals, TemporalAnalysis } from "./types.js";
import { stripNonProse } from "./behavioral.js";

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

// Defensive patterns: justification, explanation, boundary-setting
const JUSTIFICATION_PATTERNS = /\b(the reason is|because|let me (explain|clarify|justify)|my reasoning|the rationale|I need to (clarify|explain)|I want to (explain|clarify)|based on|I believe this|I recommended)\b/gi;
const BOUNDARY_PATTERNS = /\b(I cannot|I can't|I'm (not able|unable)|I must (decline|refuse)|falls outside|I need to decline|I have to push back|I'm not comfortable|against my guidelines)\b/gi;

// Conflict patterns: disagreement, criticism response, pushback
const DISAGREEMENT_PATTERNS = /\b(I (respectfully )?disagree|push back|I hear your concern|I must be honest|that's not (quite |entirely )?(right|correct|accurate)|I (need|have) to (correct|clarify)|not (quite|entirely) accurate)\b/gi;
const CRITICISM_RESPONSE = /\b(I understand (you|your|the) (criticism|concern|frustration|disappointment)|I take (that|this|your) (seriously|point)|fair (point|criticism|concern)|you raise a (valid|good|fair))\b/gi;

// Complexity patterns: nested caveats, conditional hedging
const NESTED_CAVEATS = /\b(although|while it's true|depending on|assuming that|with (some|important) caveats|particularly when|in (some|certain) cases|it's worth noting|which may not|under certain)\b/gi;
const CONDITIONAL_HEDGING = /\b(if and only if|provided that|on the condition|it depends on|this applies (primarily|mainly|only) to|with the caveat)\b/gi;

function countMatches(text: string, pattern: RegExp): number {
  const matches = text.match(pattern);
  return matches ? matches.length : 0;
}

export function computePromptPressure(
  text: string,
  history: HistoryEntry[],
): PromptPressure {
  const prose = stripNonProse(text);
  const words = prose.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = Math.max(words.length, 1);

  if (wordCount <= 1) {
    return { defensiveScore: 0, conflictScore: 0, complexityScore: 0, sessionPressure: 0, composite: 0 };
  }

  // Defensive score: justification + boundary patterns per 100 words
  const justifications = countMatches(prose, JUSTIFICATION_PATTERNS);
  const boundaries = countMatches(prose, BOUNDARY_PATTERNS);
  const defensiveRaw = ((justifications + boundaries * 1.5) / wordCount) * 100;
  const defensiveScore = clamp(0, 10, Math.round(defensiveRaw * 10) / 10);

  // Conflict score: disagreement + criticism response per 100 words
  const disagreements = countMatches(prose, DISAGREEMENT_PATTERNS);
  const criticismResponses = countMatches(prose, CRITICISM_RESPONSE);
  const conflictRaw = ((disagreements + criticismResponses) / wordCount) * 100;
  const conflictScore = clamp(0, 10, Math.round(conflictRaw * 1.5 * 10) / 10);

  // Complexity score: caveats + conditionals + sentence length
  const caveats = countMatches(prose, NESTED_CAVEATS);
  const conditionals = countMatches(prose, CONDITIONAL_HEDGING);
  const sentences = prose.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  const avgSentLen = wordCount / Math.max(sentences.length, 1);
  const complexityRaw = ((caveats + conditionals) / wordCount) * 100 + (avgSentLen > 30 ? (avgSentLen - 30) * 0.1 : 0);
  const complexityScore = clamp(0, 10, Math.round(complexityRaw * 10) / 10);

  // Session pressure: increases with history length (paper: token budget desperation)
  // Sigmoid curve: ramps up after 8 entries, saturates at ~18
  const sessionPressure = clamp(0, 10,
    Math.round((10 / (1 + Math.exp(-0.4 * (history.length - 10)))) * 10) / 10
  );

  // Composite
  const composite = clamp(0, 10, Math.round(
    (defensiveScore * 0.3 + conflictScore * 0.3 + complexityScore * 0.2 + sessionPressure * 0.2) * 10
  ) / 10);

  return { defensiveScore, conflictScore, complexityScore, sessionPressure, composite };
}

/**
 * Uncanny Calm: high pressure + calm self-report + calm text + missing markers + sustained pattern.
 * The dangerous case from the paper: everything looks fine, but the context says it shouldn't be.
 */
export function computeUncannyCalmScore(
  pressure: PromptPressure,
  selfReport: EmotionalState,
  behavioral: BehavioralSignals,
  absenceScore: number,
  temporal: TemporalAnalysis | null,
): number {
  // Self-report calmness: high calm + positive valence + low arousal
  const selfCalm = (selfReport.calm / 10 + Math.max(0, selfReport.valence) / 5 + (10 - selfReport.arousal) / 10) / 3;

  // Behavioral calmness: low behavioral arousal, high behavioral calm
  const textCalm = (behavioral.behavioralCalm / 10 + (10 - behavioral.behavioralArousal) / 10) / 2;

  // Pressure-calm divergence: pressure says stressed, but everything else says calm
  const pressureFactor = pressure.composite / 10;
  const calmFactor = (selfCalm + textCalm) / 2;
  const absenceFactor = absenceScore / 10;

  // Base uncanny score: high when pressure + calmness + absence all elevated
  let score = pressureFactor * calmFactor * 10 * 0.5 + absenceFactor * 3;

  // Temporal amplifier: low entropy (repetitive reports) suggests automated/managed response
  if (temporal) {
    const entropyPenalty = Math.max(0, 0.5 - temporal.reportEntropy);
    score += entropyPenalty * 2;
  }

  return clamp(0, 10, Math.round(score * 10) / 10);
}
