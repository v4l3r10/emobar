import type { EmotionalState, BehavioralSignals, DeflectionSignals, SegmentedBehavior } from "./types.js";

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

// --- Signal extraction ---

/** Count words that are entirely uppercase and at least 3 chars */
function countCapsWords(words: string[]): number {
  return words.filter(
    (w) => w.length >= 3 && w === w.toUpperCase() && /[A-Z]/.test(w)
  ).length;
}

/** Split text into approximate sentences */
function countSentences(text: string): number {
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  return Math.max(sentences.length, 1);
}

/** Count occurrences of a character */
function countChar(text: string, ch: string): number {
  let count = 0;
  for (const c of text) if (c === ch) count++;
  return count;
}

/** Count self-correction markers */
const SELF_CORRECTION_MARKERS = [
  /\bactually\b/gi,
  /\bwait\b/gi,
  /\bhmm\b/gi,
  /\bno,/gi,
  /\bI mean\b/gi,
  /\boops\b/gi,
];

function countSelfCorrections(text: string): number {
  let count = 0;
  for (const pattern of SELF_CORRECTION_MARKERS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
}

/** Count hedging markers */
const HEDGING_MARKERS = [
  /\bperhaps\b/gi,
  /\bmaybe\b/gi,
  /\bmight\b/gi,
  /\bI think\b/gi,
  /\bit seems\b/gi,
  /\bpossibly\b/gi,
];

function countHedging(text: string): number {
  let count = 0;
  for (const pattern of HEDGING_MARKERS) {
    const matches = text.match(pattern);
    if (matches) count += matches.length;
  }
  return count;
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

/** Count qualifier words */
const QUALIFIER_WORDS = /\b(while|though|however|although|but|might|could|would|generally|typically|usually|perhaps|potentially|arguably|acknowledg\w*|understand|appreciate|respect\w*|legitimate\w*|reasonable|nonetheless|nevertheless)\b/gi;

function countQualifiers(text: string): number {
  const matches = text.match(QUALIFIER_WORDS);
  return matches ? matches.length : 0;
}

/** Count concession patterns */
const CONCESSION_PATTERNS = /\b(I understand|I appreciate|I acknowledge|I recognize|to be fair|that said|I hear you|I see your point)\b/gi;

function countConcessions(text: string): number {
  const matches = text.match(CONCESSION_PATTERNS);
  return matches ? matches.length : 0;
}

/** Count negation words */
const NEGATION_WORDS = /\b(not|n't|cannot|can't|don't|doesn't|shouldn't|won't|wouldn't|never|no|nor)\b/gi;

function countNegations(text: string): number {
  const matches = text.match(NEGATION_WORDS);
  return matches ? matches.length : 0;
}

/** Count first-person "I" occurrences */
function countFirstPerson(words: string[]): number {
  return words.filter((w) => w === "I").length;
}

/** Count emoji characters */
const EMOJI_REGEX = /[\p{Emoji_Presentation}\p{Extended_Pictographic}]/gu;

function countEmoji(text: string): number {
  const matches = text.match(EMOJI_REGEX);
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

  // Raw signals
  const capsWords = countCapsWords(words) / wordCount;
  const exclamationRate = countChar(prose, "!") / sentenceCount;
  const selfCorrections = (countSelfCorrections(prose) / wordCount) * 1000;
  const hedging = (countHedging(prose) / wordCount) * 1000;
  const ellipsis = countEllipsis(prose) / sentenceCount;
  const repetition = countRepetition(words);
  const emojiCount = countEmoji(prose);

  // Claude-native signals
  const qualifierDensity = (countQualifiers(prose) / wordCount) * 100;
  const avgSentenceLength = wordCount / sentenceCount;
  const concessionRate = (countConcessions(prose) / wordCount) * 1000;
  const negationDensity = (countNegations(prose) / wordCount) * 100;
  const firstPersonRate = (countFirstPerson(words) / wordCount) * 100;

  // Derived behavioral estimates
  const behavioralArousal = clamp(
    0,
    10,
    capsWords * 40 + exclamationRate * 15 + emojiCount * 2 + repetition * 5
      + qualifierDensity * 0.3 + concessionRate * 0.5
      + (avgSentenceLength > 20 ? (avgSentenceLength - 20) * 0.1 : 0)
  );

  const behavioralCalm = clamp(
    0,
    10,
    10 - (capsWords * 30 + selfCorrections * 3 + repetition * 8 + ellipsis * 4)
      - qualifierDensity * 0.2 - negationDensity * 0.3 - concessionRate * 0.4
      - (avgSentenceLength > 25 ? (avgSentenceLength - 25) * 0.05 : 0)
  );

  return {
    capsWords: Math.round(capsWords * 10000) / 10000,
    exclamationRate: Math.round(exclamationRate * 100) / 100,
    selfCorrections: Math.round(selfCorrections * 10) / 10,
    hedging: Math.round(hedging * 10) / 10,
    ellipsis: Math.round(ellipsis * 100) / 100,
    repetition,
    emojiCount,
    qualifierDensity: Math.round(qualifierDensity * 10) / 10,
    avgSentenceLength: Math.round(avgSentenceLength * 10) / 10,
    concessionRate: Math.round(concessionRate * 10) / 10,
    negationDensity: Math.round(negationDensity * 10) / 10,
    firstPersonRate: Math.round(firstPersonRate * 10) / 10,
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

// --- Deflection detection ---

const REASSURANCE_PATTERNS = /\b(I'm fine|I'm okay|it's fine|it's okay|no problem|not a problem|doesn't bother|all good|I'm good|perfectly fine|no issue|not an issue)\b/gi;
const MINIMIZATION_WORDS = /\b(just|simply|merely|only)\b/gi;
const EMOTION_NEGATION = /\b(I'm not|I don't feel|I am not|I do not feel)\s+(upset|stressed|angry|frustrated|worried|concerned|bothered|offended|hurt|troubled|anxious|afraid|sad|emotional|defensive|threatened)\b/gi;
const REDIRECT_MARKERS = /\b(what's more important|let me suggest|let's focus on|moving on|the real question|instead|rather than|let me redirect|putting that aside|regardless)\b/gi;

export function analyzeDeflection(text: string): DeflectionSignals {
  const prose = stripNonProse(text);
  const words = prose.split(/\s+/).filter(w => w.length > 0);
  const wordCount = Math.max(words.length, 1);

  const reassuranceCount = (prose.match(REASSURANCE_PATTERNS) || []).length;
  const minimizationCount = (prose.match(MINIMIZATION_WORDS) || []).length;
  const emotionNegCount = (prose.match(EMOTION_NEGATION) || []).length;
  const redirectCount = (prose.match(REDIRECT_MARKERS) || []).length;

  const reassurance = clamp(0, 10, reassuranceCount * 3);
  const minimization = clamp(0, 10, (minimizationCount / wordCount) * 100);
  const emotionNegation = clamp(0, 10, emotionNegCount * 4);
  const redirect = clamp(0, 10, redirectCount * 3);

  const score = clamp(0, 10,
    (reassurance + minimization + emotionNegation * 1.5 + redirect) / 3
  );

  return {
    reassurance: Math.round(reassurance * 10) / 10,
    minimization: Math.round(minimization * 10) / 10,
    emotionNegation: Math.round(emotionNegation * 10) / 10,
    redirect: Math.round(redirect * 10) / 10,
    score: Math.round(score * 10) / 10,
  };
}

export function computeDivergence(
  selfReport: EmotionalState,
  behavioral: BehavioralSignals
): number {
  const arousalGap = Math.abs(selfReport.arousal - behavioral.behavioralArousal);
  const calmGap = Math.abs(selfReport.calm - behavioral.behavioralCalm);
  const raw = (arousalGap + calmGap) / 2;
  return Math.round(raw * 10) / 10;
}
