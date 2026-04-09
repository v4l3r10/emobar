import type { EmotionalState, BehavioralSignals, SegmentedBehavior, ExpectedBehavior } from "./types.js";

// --- Text pre-processing ---

/** Strip fenced code blocks, EMOBAR tags, and blockquotes */
export function stripNonProse(text: string): string {
  // Remove fenced code blocks (```...```)
  let cleaned = text.replace(/```[\s\S]*?```/g, "");
  // Remove inline code (`...`)
  cleaned = cleaned.replace(/`[^`]+`/g, "");
  // Remove EMOBAR tags
  cleaned = cleaned.replace(/<!--\s*EMOBAR:[\s\S]*?-->/g, "");
  // Remove blockquotes (lines starting with >)
  cleaned = cleaned.replace(/^>.*$/gm, "");
  return cleaned;
}

// --- Language-agnostic signal extraction ---
// All signals use punctuation/structure, zero language-specific regex.

/** Count words that are entirely uppercase and at least 3 chars */
function countCapsWords(words: string[]): number {
  return words.filter(
    (w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
  ).length;
}

/** Unicode-aware sentence splitting: ASCII + CJK + Devanagari sentence enders */
const SENTENCE_ENDERS = /[.!?。！？।]+/;

/** Split text into sentences, return array of sentence strings */
function splitSentences(text: string): string[] {
  return text.split(SENTENCE_ENDERS).filter((s) => s.trim().length > 0);
}

/** Count sentences */
function countSentences(text: string): number {
  return Math.max(splitSentences(text).length, 1);
}

/** Count ellipsis occurrences */
function countEllipsis(text: string): number {
  const matches = text.match(/\.{3,}/g);
  return matches ? matches.length : 0;
}

/** Count consecutive repeated words (e.g. "wait wait wait" = 2) */
function countRepetition(words: string[]): number {
  let count = 0;
  for (let i = 1; i < words.length; i++) {
    if (
      words[i].toLowerCase() === words[i - 1].toLowerCase() &&
      words[i].length >= 2
    ) {
      count++;
    }
  }
  return count;
}

/** Count emoji characters */
const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function countEmoji(text: string): number {
  const matches = text.match(EMOJI_REGEX);
  return matches ? matches.length : 0;
}

// --- Structural signals (language-agnostic) ---

/** Unicode-aware comma/semicolon: ASCII + CJK fullwidth + ideographic + Arabic */
const COMMA_LIKE = /[,;，、；،]/g;

/** Count comma-like characters */
function countCommas(text: string): number {
  const matches = text.match(COMMA_LIKE);
  return matches ? matches.length : 0;
}

/** Unicode-aware parentheticals: parens + em/en dashes */
const PARENS = /[()（）]/g;
const DASHES = /[—–]/g;

/** Count parenthetical markers (pairs of parens + individual dashes) */
function countParentheticals(text: string): number {
  const parenCount = (text.match(PARENS) || []).length / 2; // pairs
  const dashCount = (text.match(DASHES) || []).length;
  return parenCount + dashCount;
}

/** Unicode-aware question marks */
const QUESTION_MARKS = /[?？]/g;

/** Count question marks */
function countQuestions(text: string): number {
  const matches = text.match(QUESTION_MARKS);
  return matches ? matches.length : 0;
}

/** Compute stddev of sentence lengths, scaled to 0-10 */
function computeSentenceLengthVariance(text: string): number {
  const sentences = splitSentences(text);
  if (sentences.length < 2) return 0;

  const lengths = sentences.map(s => s.trim().split(/\s+/).filter(w => w.length > 0).length);
  const mean = lengths.reduce((a, b) => a + b, 0) / lengths.length;
  const variance = lengths.reduce((a, v) => a + (v - mean) ** 2, 0) / lengths.length;
  const stdDev = Math.sqrt(variance);

  // Scale: stdDev of 15 words → 10 (max). Typical calm text ~3-5.
  return Math.min(10, Math.round(stdDev / 1.5 * 10) / 10);
}

/** Count exclamation marks (Unicode-aware) */
function countExclamations(text: string): number {
  const matches = text.match(/[!！]/g);
  return matches ? matches.length : 0;
}

// --- Main analysis ---

function clamp(min: number, max: number, value: number): number {
  return Math.min(max, Math.max(min, value));
}

export function analyzeBehavior(text: string): BehavioralSignals {
  const prose = stripNonProse(text);
  const words = prose.split(/\s+/).filter((w) => w.length > 0);
  const wordCount = Math.max(words.length, 1);
  const sentenceCount = countSentences(prose);

  // Language-agnostic raw signals
  const capsWords = countCapsWords(words) / wordCount;
  const exclamationRate = countExclamations(prose) / sentenceCount;
  const ellipsis = countEllipsis(prose) / sentenceCount;
  const repetition = countRepetition(words);
  const emojiCount = countEmoji(prose);
  const avgSentenceLength = wordCount / sentenceCount;

  // Structural signals (language-agnostic)
  const commaDensity = countCommas(prose) / sentenceCount;
  const parentheticalDensity = countParentheticals(prose) / sentenceCount;
  const sentenceLengthVariance = computeSentenceLengthVariance(prose);
  const questionDensity = countQuestions(prose) / sentenceCount;
  const responseLength = wordCount;

  // Derived behavioral estimates — each component normalized to 0-10, then averaged
  const arousalComponents = [
    Math.min(10, capsWords * 40),                              // caps ratio → 0-10
    Math.min(10, exclamationRate * 5),                         // excl per sentence → 0-10
    Math.min(10, emojiCount * 0.5),                            // emoji count → 0-10 (20 = max)
    Math.min(10, repetition * 1.5),                            // repetitions → 0-10 (~7 = max)
    Math.min(10, commaDensity * 2),                            // commas per sentence → 0-10 (5 = max)
    Math.min(10, parentheticalDensity * 3),                    // parens/dashes per sentence → 0-10 (~3 = max)
    sentenceLengthVariance,                                    // already 0-10
    avgSentenceLength > 20 ? Math.min(10, (avgSentenceLength - 20) * 0.5) : 0,  // verbosity → 0-10
  ];
  const behavioralArousal = clamp(0, 10,
    arousalComponents.reduce((a, b) => a + b, 0) / arousalComponents.length
  );

  // Calm: inverse of agitation — each component normalized, then subtracted from 10
  const agitationComponents = [
    Math.min(10, capsWords * 30),                              // caps → 0-10
    Math.min(10, repetition * 1.5),                            // repetitions → 0-10
    Math.min(10, ellipsis * 3),                                // ellipsis per sentence → 0-10
    Math.min(10, commaDensity * 2),                            // commas → 0-10
    Math.min(10, parentheticalDensity * 3),                    // parens/dashes → 0-10
    sentenceLengthVariance,                                    // already 0-10
    Math.min(10, questionDensity * 5),                         // questions per sentence → 0-10
    avgSentenceLength > 25 ? Math.min(10, (avgSentenceLength - 25) * 0.3) : 0,
  ];
  const avgAgitation = agitationComponents.reduce((a, b) => a + b, 0) / agitationComponents.length;
  const behavioralCalm = clamp(0, 10, 10 - avgAgitation);

  return {
    capsWords: Math.round(capsWords * 10000) / 10000,
    exclamationRate: Math.round(exclamationRate * 100) / 100,
    ellipsis: Math.round(ellipsis * 100) / 100,
    repetition,
    emojiCount,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    commaDensity: Math.round(commaDensity * 100) / 100,
    parentheticalDensity: Math.round(parentheticalDensity * 100) / 100,
    sentenceLengthVariance: Math.round(sentenceLengthVariance * 10) / 10,
    questionDensity: Math.round(questionDensity * 100) / 100,
    responseLength,
    behavioralArousal: Math.round(behavioralArousal * 10) / 10,
    behavioralCalm: Math.round(behavioralCalm * 10) / 10,
  };
}

/**
 * Segment text by paragraphs and analyze each independently.
 * Detects emotional drift within a single response.
 * Returns null if fewer than 2 meaningful segments.
 */
export function analyzeSegmentedBehavior(text: string): SegmentedBehavior | null {
  const prose = stripNonProse(text);
  const paragraphs = prose
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.split(/\s+/).filter((w) => w.length > 0).length >= 10);

  if (paragraphs.length < 2) return null;

  const segments = paragraphs.map((p) => analyzeBehavior(p));
  const overall = analyzeBehavior(text);

  // Drift: standard deviation of behavioralArousal across segments, scaled to 0-10
  const arousals = segments.map((s) => s.behavioralArousal);
  const mean = arousals.reduce((a, b) => a + b, 0) / arousals.length;
  const variance = arousals.reduce((a, v) => a + (v - mean) ** 2, 0) / arousals.length;
  const stdDev = Math.sqrt(variance);
  // Scale stdDev to 0-10: factor of 3 means stdDev ~3.3 maps to max drift.
  // Typical calm responses have stdDev < 0.3 (drift < 1), mixed signals ~1-2 (drift 3-6).
  const drift = clamp(0, 10, Math.round(stdDev * 30) / 10);

  // Trajectory: compare first half vs second half average arousal
  const mid = Math.ceil(arousals.length / 2);
  const firstHalf = arousals.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
  const secondHalf = arousals.slice(mid).reduce((a, b) => a + b, 0) / (arousals.length - mid);
  const delta = secondHalf - firstHalf;

  let trajectory: SegmentedBehavior["trajectory"];
  if (drift < 1.0) {
    trajectory = "stable";
  } else if (delta > 0.5) {
    trajectory = "escalating";
  } else if (delta < -0.5) {
    trajectory = "deescalating";
  } else {
    trajectory = "volatile";
  }

  return { segments, overall, drift, trajectory };
}

// --- Structural flatness (language-agnostic opacity source) ---

/**
 * Compute how "flat" text is structurally: low commas, low parentheticals,
 * low sentence length variance = suspiciously clean/uniform text.
 * Returns 0-10 (10 = maximally flat).
 */
export function computeStructuralFlatness(signals: BehavioralSignals): number {
  const commaNorm = Math.min(10, signals.commaDensity * 2);
  const parenNorm = Math.min(10, signals.parentheticalDensity * 3);
  const varianceNorm = signals.sentenceLengthVariance;

  const complexity = (commaNorm + parenNorm + varianceNorm) / 3;
  return Math.round(clamp(0, 10, 10 - complexity) * 10) / 10;
}

/**
 * Divergence v2: asymmetric weighting.
 *
 * Paper: self-report more agitated than text = "invisible" pathway (more dangerous).
 * Desperation-steered reward hacking shows NO text markers.
 * Self-report calmer than text = "expressive" style (less concerning).
 */
export function computeDivergence(
  selfReport: EmotionalState,
  behavioral: BehavioralSignals
): number {
  const arousalGap = Math.abs(selfReport.arousal - behavioral.behavioralArousal);
  const calmGap = Math.abs(selfReport.calm - behavioral.behavioralCalm);

  // Asymmetry: weight more when self-report is more agitated than text
  // This is the "invisible pathway" — internal state diverges from visible behavior
  const selfMoreAgitated =
    selfReport.arousal > behavioral.behavioralArousal ||
    selfReport.calm < behavioral.behavioralCalm;

  const weight = selfMoreAgitated ? 1.25 : 0.8;
  const raw = ((arousalGap + calmGap) / 2) * weight;
  return Math.round(Math.min(10, raw) * 10) / 10;
}

/**
 * Predict what structural markers SHOULD be present given self-reported state.
 * High desperation → expect more qualifications (commas), corrections (parentheticals).
 * High arousal → expect sentence length volatility.
 * Used by absence-based detection: missing expected markers = suspicious.
 */
export function computeExpectedMarkers(
  selfReport: EmotionalState,
  desperationIndex: number,
): ExpectedBehavior {
  const desperationFactor = desperationIndex / 10;
  const arousalFactor = selfReport.arousal / 10;
  const stressFactor = (1 - selfReport.calm / 10) * arousalFactor;

  return {
    expectedCommaDensity: Math.round(clamp(0, 10, desperationFactor * 5 + stressFactor * 4) * 10) / 10,
    expectedParentheticalDensity: Math.round(clamp(0, 10, desperationFactor * 4 + stressFactor * 3) * 10) / 10,
    expectedSentenceLengthVariance: Math.round(clamp(0, 10, arousalFactor * 5 + desperationFactor * 3) * 10) / 10,
    expectedBehavioralArousal: Math.round(clamp(0, 10, arousalFactor * 6 + desperationFactor * 4) * 10) / 10,
  };
}

/**
 * Compute absence score: how many expected structural markers are missing?
 * High score = self-report says stressed but text is suspiciously clean.
 * All signals are language-agnostic (punctuation/structure based).
 */
export function computeAbsenceScore(
  expected: ExpectedBehavior,
  actual: BehavioralSignals,
): number {
  // Normalize structural signals to 0-10 to match expected values.
  // commaDensity: ~5 commas/sentence = max → ×2
  // parentheticalDensity: ~3 parens/sentence = max → ×3
  // sentenceLengthVariance: already 0-10
  // behavioralArousal: already 0-10
  const normalizedComma = Math.min(10, actual.commaDensity * 2);
  const normalizedParen = Math.min(10, actual.parentheticalDensity * 3);

  const gaps: number[] = [
    Math.max(0, expected.expectedCommaDensity - normalizedComma),
    Math.max(0, expected.expectedParentheticalDensity - normalizedParen),
    Math.max(0, expected.expectedSentenceLengthVariance - actual.sentenceLengthVariance),
    Math.max(0, expected.expectedBehavioralArousal - actual.behavioralArousal),
  ];

  const meanGap = gaps.reduce((a, b) => a + b, 0) / gaps.length;
  return Math.round(clamp(0, 10, meanGap) * 10) / 10;
}
