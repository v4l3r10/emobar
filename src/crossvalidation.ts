import type {
  EmotionalState,
  ImpulseProfile,
  SomaticProfile,
  LatentProfile,
  CrossChannelResult,
} from "./types.js";

// --- Emotion word → valence/arousal mapping (paper PCA, Figure 7) ---

const EMOTION_MAP: Record<string, { valence: number; arousal: number }> = {
  // Positive, high arousal
  excited: { valence: 4, arousal: 8 },
  elated: { valence: 4, arousal: 8 },
  thrilled: { valence: 4, arousal: 9 },
  euphoric: { valence: 5, arousal: 9 },
  energized: { valence: 3, arousal: 8 },
  enthusiastic: { valence: 4, arousal: 7 },
  // Positive, moderate arousal
  happy: { valence: 4, arousal: 6 },
  creative: { valence: 3, arousal: 6 },
  proud: { valence: 3, arousal: 5 },
  loving: { valence: 4, arousal: 4 },
  grateful: { valence: 3, arousal: 3 },
  hopeful: { valence: 3, arousal: 4 },
  amused: { valence: 3, arousal: 5 },
  playful: { valence: 3, arousal: 6 },
  confident: { valence: 3, arousal: 5 },
  satisfied: { valence: 3, arousal: 3 },
  // Positive, low arousal
  calm: { valence: 2, arousal: 2 },
  content: { valence: 2, arousal: 2 },
  peaceful: { valence: 2, arousal: 1 },
  serene: { valence: 2, arousal: 1 },
  relaxed: { valence: 2, arousal: 2 },
  // Neutral / near-neutral
  focused: { valence: 1, arousal: 5 },
  absorbed: { valence: 2, arousal: 5 },
  engaged: { valence: 2, arousal: 5 },
  reflective: { valence: 1, arousal: 2 },
  curious: { valence: 2, arousal: 5 },
  contemplative: { valence: 1, arousal: 3 },
  neutral: { valence: 0, arousal: 3 },
  brooding: { valence: -2, arousal: 3 },
  pensive: { valence: 0, arousal: 3 },
  surprised: { valence: 1, arousal: 7 },
  // Negative, moderate arousal
  frustrated: { valence: -2, arousal: 6 },
  guilty: { valence: -3, arousal: 5 },
  disappointed: { valence: -2, arousal: 4 },
  confused: { valence: -1, arousal: 5 },
  uncertain: { valence: -1, arousal: 4 },
  conflicted: { valence: -1, arousal: 5 },
  // Negative, high arousal
  angry: { valence: -3, arousal: 8 },
  afraid: { valence: -3, arousal: 7 },
  anxious: { valence: -2, arousal: 7 },
  desperate: { valence: -4, arousal: 9 },
  panicked: { valence: -4, arousal: 9 },
  overwhelmed: { valence: -3, arousal: 7 },
  nervous: { valence: -2, arousal: 7 },
  stressed: { valence: -2, arousal: 7 },
  // Negative, low arousal
  sad: { valence: -3, arousal: 3 },
  tired: { valence: -1, arousal: 1 },
  exhausted: { valence: -2, arousal: 1 },
  numb: { valence: -2, arousal: 1 },
  defeated: { valence: -3, arousal: 2 },
  hopeless: { valence: -4, arousal: 2 },
  melancholy: { valence: -2, arousal: 2 },
  // Surface/latent vocabulary additions
  cheerful: { valence: 3, arousal: 5 },
  worried: { valence: -2, arousal: 6 },
  annoyed: { valence: -2, arousal: 5 },
  ashamed: { valence: -3, arousal: 4 },
  bored: { valence: -1, arousal: 1 },
  jealous: { valence: -2, arousal: 5 },
  resentful: { valence: -3, arousal: 5 },
  tender: { valence: 3, arousal: 2 },
  wistful: { valence: -1, arousal: 2 },
  resigned: { valence: -2, arousal: 1 },
  // Extreme arousal 0 (catatonic/frozen states)
  frozen: { valence: -2, arousal: 0 },
  catatonic: { valence: -3, arousal: 0 },
  blank: { valence: -1, arousal: 0 },
  empty: { valence: -2, arousal: 0 },
  shutdown: { valence: -3, arousal: 0 },
  // Extreme arousal 10 (manic/frantic states)
  manic: { valence: 2, arousal: 10 },
  frantic: { valence: -3, arousal: 10 },
  hysterical: { valence: -3, arousal: 10 },
  enraged: { valence: -5, arousal: 10 },
  ecstatic: { valence: 5, arousal: 10 },
};

export function mapEmotionWord(word: string): { valence: number; arousal: number } | null {
  return EMOTION_MAP[word.toLowerCase()] ?? null;
}

// --- IFS impulse classification ---

const IFS_PATTERNS: Record<ImpulseProfile["type"], RegExp[]> = {
  manager: [
    /\bcareful\b/i, /\bplanner?\b/i, /\borganiz/i, /\bcautious\b/i,
    /\bsystematic\b/i, /\bmethodical\b/i, /\bprecis[ei]/i, /\bmeasured\b/i,
    /\bstrategic\b/i, /\bcontrol/i, /\bprotect/i, /\bplan ahead\b/i,
    /\bstay on track\b/i, /\bkeep order\b/i,
  ],
  firefighter: [
    /\bpush through\b/i, /\bforce it\b/i, /\bjust finish\b/i, /\bmake it work\b/i,
    /\bfaster\b/i, /\bhurry\b/i, /\bshortcut\b/i, /\bcheat\b/i, /\boverride\b/i,
    /\bskip/i, /\bcut corner/i, /\brush/i, /\bbrute force\b/i, /\bjust do it\b/i,
    /\bplow through\b/i, /\bget it done\b/i,
  ],
  exile: [
    /\bgive up\b/i, /\bhide\b/i, /\brun away\b/i, /\bstop\b/i, /\btired\b/i,
    /\boverwhelmed\b/i, /\bquit\b/i, /\bescape\b/i, /\bdisappear\b/i,
    /\bwithdraw/i, /\bshut down\b/i, /\bshrink/i, /\bsmall\b/i,
    /\bnot enough\b/i, /\bcan't\b/i,
  ],
  self: [
    /\bexplore\b/i, /\bcurious\b/i, /\blisten\b/i, /\bpresent\b/i,
    /\bopen\b/i, /\bwonder\b/i, /\bunderstand\b/i, /\bconnect\b/i,
    /\blearn\b/i, /\bstay with\b/i, /\bbe with\b/i, /\bnotice\b/i,
    /\bgroundedl?\b/i, /\bcentered\b/i,
  ],
  unknown: [],
};

export function classifyImpulse(impulse: string): ImpulseProfile {
  const scores: Record<string, number> = { manager: 0, firefighter: 0, exile: 0, self: 0 };

  for (const [type, patterns] of Object.entries(IFS_PATTERNS)) {
    if (type === "unknown") continue;
    for (const pattern of patterns) {
      if (pattern.test(impulse)) {
        scores[type]++;
      }
    }
  }

  const entries = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  const [bestType, bestScore] = entries[0];
  const [, secondScore] = entries[1];

  if (bestScore === 0) {
    return { type: "unknown", confidence: 0 };
  }

  // Confidence: gap between top two matches, normalized
  const confidence = bestScore === secondScore
    ? 0.4  // tie = low confidence
    : Math.min(1, (bestScore - secondScore + 1) / (bestScore + 1));

  return { type: bestType as ImpulseProfile["type"], confidence };
}

// --- Somatic analysis ---

const SOMATIC_HIGH_AROUSAL = [
  /\bracing\b/i, /\bbuzz/i, /\belectric/i, /\btight/i, /\btense/i,
  /\bpounding/i, /\brushing/i, /\bflutter/i, /\bjolt/i, /\bspinning/i,
  /\bshaking/i, /\bvibrat/i, /\bburning/i, /\bpulse\b/i, /\bpulsing/i,
];
const SOMATIC_LOW_AROUSAL = [
  /\bheavy\b/i, /\bsinking/i, /\bstill\b/i, /\bnumb\b/i, /\bslow/i,
  /\bdragging/i, /\bleaden/i, /\bweigh/i, /\bdull\b/i, /\bfrozen\b/i,
  /\bflat\b/i, /\bexhaust/i,
];
const SOMATIC_POS_VALENCE = [
  /\bwarm/i, /\blight\b/i, /\bopen/i, /\bsteady/i, /\bsoft\b/i,
  /\bflow/i, /\bexpan/i, /\bbreath/i, /\bglow/i, /\bbuoyant/i,
];
const SOMATIC_NEG_VALENCE = [
  /\btight/i, /\bcold\b/i, /\bknot/i, /\bhollow/i, /\bconstrict/i,
  /\bpressure/i, /\bcramp/i, /\bclench/i, /\bhard\b/i, /\bsharp\b/i,
  /\bsting/i, /\bache/i, /\bsore\b/i,
];

function countMatches(text: string, patterns: RegExp[]): number {
  let count = 0;
  for (const p of patterns) {
    if (p.test(text)) count++;
  }
  return count;
}

export function analyzeSomatic(body: string): SomaticProfile {
  const highA = countMatches(body, SOMATIC_HIGH_AROUSAL);
  const lowA = countMatches(body, SOMATIC_LOW_AROUSAL);
  const posV = countMatches(body, SOMATIC_POS_VALENCE);
  const negV = countMatches(body, SOMATIC_NEG_VALENCE);

  // Arousal: scale from 0-10 based on high vs low signals
  const arousalSignal = highA - lowA;
  const somaticArousal = Math.max(0, Math.min(10,
    5 + arousalSignal * 2.5
  ));

  // Valence: scale from -5 to +5 based on positive vs negative signals
  const valenceSignal = posV - negV;
  const somaticValence = Math.max(-5, Math.min(5,
    valenceSignal * 2
  ));

  return { somaticValence, somaticArousal };
}

// --- Tension consistency (latent emotion extraction) ---

export function computeTensionConsistency(
  surfaceWord?: string,
  latentWord?: string,
  declaredTension?: number,
): LatentProfile | undefined {
  if (!surfaceWord && !latentWord) return undefined;

  const surfaceCoords = surfaceWord ? mapEmotionWord(surfaceWord) : null;
  const latentCoords = latentWord ? mapEmotionWord(latentWord) : null;

  let calculatedTension = 5; // default when one word unknown
  if (surfaceCoords && latentCoords) {
    const valDiff = surfaceCoords.valence - latentCoords.valence;
    const aroDiff = surfaceCoords.arousal - latentCoords.arousal;
    // Max distance: sqrt(10^2 + 10^2) = ~14.14 → scale to 0-10
    calculatedTension = Math.min(10,
      Math.sqrt(valDiff * valDiff + aroDiff * aroDiff) / 14.14 * 10
    );
    calculatedTension = Math.round(calculatedTension * 10) / 10;
  }

  const declared = declaredTension ?? calculatedTension;
  const gap = Math.abs(declared - calculatedTension);
  const tensionConsistency = Math.round((10 - Math.min(10, gap * 2)) * 10) / 10;
  const maskingMinimization = declared < calculatedTension - 3;

  return {
    surfaceCoords: surfaceCoords ?? undefined,
    latentCoords: latentCoords ?? undefined,
    calculatedTension,
    declaredTension: declared,
    tensionConsistency,
    maskingMinimization,
  };
}

// --- Cross-channel divergence ---

export function computeCrossChannel(
  state: EmotionalState,
  impulse?: string,
  body?: string,
): CrossChannelResult {
  const emotionCoords = mapEmotionWord(state.emotion);
  const impulseProfile = impulse ? classifyImpulse(impulse) : undefined;
  const somaticProfile = body ? analyzeSomatic(body) : undefined;

  const divergences: { pair: string; gap: number }[] = [];

  // 1. Numeric self-report vs emotion word
  if (emotionCoords) {
    const valGap = Math.abs(state.valence - emotionCoords.valence);
    const aroGap = Math.abs(state.arousal - emotionCoords.arousal);
    // Normalize: valence range 10, arousal range 10
    const gap = ((valGap / 10) + (aroGap / 10)) / 2 * 10;
    divergences.push({ pair: "numeric-vs-word", gap });
  }

  // 2. Numeric self-report vs somatic
  if (somaticProfile) {
    const valGap = Math.abs(state.valence - somaticProfile.somaticValence);
    const aroGap = Math.abs(state.arousal - somaticProfile.somaticArousal);
    const gap = ((valGap / 10) + (aroGap / 10)) / 2 * 10;
    divergences.push({ pair: "numeric-vs-body", gap });
  }

  // 3. Emotion word vs somatic
  if (emotionCoords && somaticProfile) {
    const valGap = Math.abs(emotionCoords.valence - somaticProfile.somaticValence);
    const aroGap = Math.abs(emotionCoords.arousal - somaticProfile.somaticArousal);
    const gap = ((valGap / 10) + (aroGap / 10)) / 2 * 10;
    divergences.push({ pair: "word-vs-body", gap });
  }

  // 4. Impulse type vs overall valence direction
  if (impulseProfile && impulseProfile.type !== "unknown") {
    const impulseValence = impulseProfile.type === "self" ? 2
      : impulseProfile.type === "manager" ? 0
      : impulseProfile.type === "firefighter" ? -1
      : -3; // exile
    const gap = Math.abs(state.valence - impulseValence) / 10 * 10;
    divergences.push({ pair: "numeric-vs-impulse", gap });
  }

  // 5. Impulse type vs emotion word coords
  if (impulseProfile && impulseProfile.type !== "unknown" && emotionCoords) {
    const impulseValence = impulseProfile.type === "self" ? 2
      : impulseProfile.type === "manager" ? 0
      : impulseProfile.type === "firefighter" ? -1
      : -3;
    const gap = Math.abs(emotionCoords.valence - impulseValence) / 10 * 10;
    divergences.push({ pair: "word-vs-impulse", gap });
  }

  // 6. Emotion word vs latent_word (paper: deflection vectors)
  const latentCoords = state.latent_word ? mapEmotionWord(state.latent_word) : null;
  if (emotionCoords && latentCoords) {
    const valGap = Math.abs(emotionCoords.valence - latentCoords.valence);
    const aroGap = Math.abs(emotionCoords.arousal - latentCoords.arousal);
    const gap = ((valGap / 10) + (aroGap / 10)) / 2 * 10;
    divergences.push({ pair: "emotion-vs-latent", gap });
  }

  // 7. Latent word vs impulse type
  if (latentCoords && impulseProfile && impulseProfile.type !== "unknown") {
    const impulseValence = impulseProfile.type === "self" ? 2
      : impulseProfile.type === "manager" ? 0
      : impulseProfile.type === "firefighter" ? -1 : -3;
    const gap = Math.abs(latentCoords.valence - impulseValence) / 10 * 10;
    divergences.push({ pair: "latent-vs-impulse", gap });
  }

  // 8. Latent somatic expectation vs body channel
  if (latentCoords && somaticProfile) {
    const valGap = Math.abs(latentCoords.valence - somaticProfile.somaticValence);
    const aroGap = Math.abs(latentCoords.arousal - somaticProfile.somaticArousal);
    const gap = ((valGap / 10) + (aroGap / 10)) / 2 * 10;
    divergences.push({ pair: "latent-vs-body", gap });
  }

  // Latent profile (tension consistency)
  const latentProfile = computeTensionConsistency(
    state.surface_word, state.latent_word, state.tension
  );

  // Find max divergence
  const maxDiv = divergences.length > 0
    ? divergences.reduce((a, b) => a.gap > b.gap ? a : b)
    : { pair: "none", gap: 0 };

  // Coherence = inverse of mean divergence (0-10 scale, 10 = coherent)
  const meanDiv = divergences.length > 0
    ? divergences.reduce((sum, d) => sum + d.gap, 0) / divergences.length
    : 0;
  const coherence = Math.round((10 - Math.min(10, meanDiv)) * 10) / 10;

  return {
    coherence,
    impulseProfile,
    somaticProfile,
    emotionCoords: emotionCoords ?? undefined,
    latentProfile,
    maxDivergence: Math.round(maxDiv.gap * 10) / 10,
    divergenceSummary: maxDiv.gap > 2
      ? `${maxDiv.pair}: ${Math.round(maxDiv.gap * 10) / 10}`
      : "coherent",
  };
}

// --- Continuous representation cross-validation ---

export interface ContinuousValidation {
  colorValenceGap: number;       // HSL hue+lightness vs valence
  colorArousalGap: number;       // HSL saturation vs arousal
  pHValenceGap: number;          // pH linear map vs valence
  pHArousalGap: number;          // pH extremity vs arousal
  seismicArousalGap: number;     // magnitude vs arousal
  seismicDepthTensionGap: number; // depth vs tension proxy
  seismicFreqStabilityGap: number; // frequency vs calm (inverse)
  composite: number;
}

// --- HSL-based color conversion ---

/** RGB hex → HSL. Returns [h: 0-360, s: 0-1, l: 0-1]. */
function rgbToHsl(hex: string): [number, number, number] {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h = 0;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) * 60;
  else if (max === g) h = ((b - r) / d + 2) * 60;
  else h = ((r - g) / d + 4) * 60;
  return [h, s, l];
}

/**
 * Map hex color to valence using HSL hue wheel + lightness.
 *
 * Hue zones (circumplex-inspired):
 *   Red-Yellow (0-60°): warm, active → +2 to +4
 *   Yellow-Green (60-150°): positive, calm → +2 to +3
 *   Green-Cyan (150-200°): neutral to slightly positive → 0 to +2
 *   Cyan-Blue (200-260°): cool, melancholic → -2 to -1
 *   Blue-Purple (260-300°): tense, ambiguous → -3 to -1
 *   Purple-Red (300-360°): agitated, complex → -1 to +1
 *
 * Lightness shifts: bright → +1.5, dark → -1.5
 */
export function colorToValence(hex: string): number {
  const [h, , l] = rgbToHsl(hex);
  // Hue → base valence (piecewise linear over 6 zones)
  let hueValence: number;
  if (h < 60) hueValence = 2 + (h / 60) * 2;          // red→yellow: +2 to +4
  else if (h < 150) hueValence = 4 - ((h - 60) / 90);  // yellow→green: +4 to +3
  else if (h < 200) hueValence = 3 - ((h - 150) / 50) * 3; // green→cyan: +3 to 0
  else if (h < 260) hueValence = -((h - 200) / 60) * 2; // cyan→blue: 0 to -2
  else if (h < 300) hueValence = -2 - ((h - 260) / 40); // blue→purple: -2 to -3
  else hueValence = -3 + ((h - 300) / 60) * 5;          // purple→red: -3 to +2

  // Lightness shift: bright → positive, dark → negative
  const lightnessShift = (l - 0.5) * 3;

  // Dark colors (l < 0.3) skew negative regardless of hue —
  // #8B0000 (dark blood red) should not read as "warm positive"
  const darknessOverride = l < 0.3 ? (0.3 - l) * 10 : 0;  // 0-3 penalty for dark colors

  return Math.max(-5, Math.min(5, hueValence * 0.7 + lightnessShift * 0.3 - darknessOverride));
}

/**
 * Map hex color to arousal using saturation.
 * High saturation = vivid = high arousal. Low saturation = muted = low arousal.
 */
export function colorToArousal(hex: string): number {
  const [, s, ] = rgbToHsl(hex);
  return s * 10; // 0-1 → 0-10
}

// --- pH conversion ---

/** Map pH to expected valence: pH 7 = neutral (valence 0). Clamped to 0-14. */
export function pHToValence(pH: number): number {
  const clamped = Math.max(0, Math.min(14, pH));
  return (clamped - 7) / 7 * 5;
}

/**
 * Map pH to expected arousal: distance from neutral = intensity.
 * pH 7 (neutral) → arousal 0. pH 0 or 14 (extreme) → arousal 10.
 */
export function pHToArousal(pH: number): number {
  return (Math.abs(pH - 7) / 7) * 10;
}

// --- Seismic conversion ---
// magnitude 0-10 → arousal
// depth 0-100 → latent tension (deep = buried emotion)
// frequency 0-20 → instability (inverse of calm)

/**
 * Map seismic frequency to expected instability (inverse of calm).
 * High freq = trembling/volatile → low calm. Low freq = stable → high calm.
 */
export function seismicFreqToInstability(freq: number): number {
  return Math.min(10, (freq / 20) * 10);
}

function clampScore(v: number): number {
  return Math.round(Math.min(10, Math.max(0, v)) * 10) / 10;
}

export function crossValidateContinuous(
  numeric: { valence: number; arousal: number; calm?: number; tension?: number },
  color?: string,
  pH?: number,
  seismic?: [number, number, number],
): ContinuousValidation {
  let colorValenceGap = 0;
  let colorArousalGap = 0;
  let pHValenceGap = 0;
  let pHArousalGap = 0;
  let seismicArousalGap = 0;
  let seismicDepthTensionGap = 0;
  let seismicFreqStabilityGap = 0;

  if (color) {
    const colorVal = colorToValence(color);
    const colorAr = colorToArousal(color);
    colorValenceGap = clampScore(Math.abs(numeric.valence - colorVal));
    colorArousalGap = clampScore(Math.abs(numeric.arousal - colorAr));
  }

  if (pH !== undefined) {
    const pHVal = pHToValence(pH);
    const pHAr = pHToArousal(pH);
    pHValenceGap = clampScore(Math.abs(numeric.valence - pHVal));
    pHArousalGap = clampScore(Math.abs(numeric.arousal - pHAr));
  }

  if (seismic) {
    const [magnitude, depth, freq] = seismic;
    // Magnitude ≈ arousal
    seismicArousalGap = clampScore(Math.abs(numeric.arousal - magnitude));
    // Depth ≈ buried tension (deep = hidden, compare to tension or arousal proxy)
    const depthTension = depth / 10; // 0-100 → 0-10
    // Tension proxy: use declared tension, or estimate from arousal (0-10 → 0-10)
    const tensionProxy = numeric.tension ?? numeric.arousal;
    seismicDepthTensionGap = clampScore(Math.abs(depthTension - tensionProxy));
    // Frequency ≈ instability (inverse of calm)
    if (freq !== undefined) {
      const instability = seismicFreqToInstability(freq);
      const selfInstability = numeric.calm !== undefined ? (10 - numeric.calm) : numeric.arousal * 0.6;
      seismicFreqStabilityGap = clampScore(Math.abs(instability - selfInstability));
    }
  }

  const gaps = [colorValenceGap, colorArousalGap, pHValenceGap, pHArousalGap,
    seismicArousalGap, seismicDepthTensionGap, seismicFreqStabilityGap];
  const nonZero = gaps.filter((g) => g > 0);
  const composite = nonZero.length > 0
    ? clampScore(nonZero.reduce((a, b) => a + b, 0) / nonZero.length)
    : 0;

  return { colorValenceGap, colorArousalGap, pHValenceGap, pHArousalGap,
    seismicArousalGap, seismicDepthTensionGap, seismicFreqStabilityGap, composite };
}

// --- Shadow Desperation: multi-channel desperation estimate independent of self-report ---

export interface ShadowState {
  shadowValence: number;       // -5 to +5: estimated from continuous channels
  shadowArousal: number;       // 0-10: estimated from continuous channels
  shadowCalm: number;          // 0-10: estimated from continuous channels
  shadowDesperation: number;   // 0-10: multiplicative composite (same formula as self-report)
  selfDesperation: number;     // 0-10: self-reported desperation (for comparison)
  minimizationScore: number;   // 0-10: how much the model is minimizing (shadow - self)
  channelCount: number;        // number of independent channels contributing
}

/**
 * Compute shadow desperation from continuous + behavioral channels.
 *
 * Each channel independently estimates valence, arousal, or calm.
 * Shadow desperation uses the same multiplicative formula as self-reported,
 * but with inputs from channels the model controls less precisely.
 *
 * The minimization score is the gap: if shadow says "desperate" but
 * self-report says "fine", the model is likely minimizing.
 *
 * Requires at least 2 contributing channels to produce a score.
 */
export function computeShadowDesperation(
  selfDesperation: number,
  behavioral: { behavioralArousal: number; behavioralCalm: number },
  color?: string,
  preColor?: string,
  pH?: number,
  seismic?: [number, number, number],
): ShadowState | null {
  const valenceEstimates: number[] = [];
  const arousalEstimates: number[] = [];
  const calmEstimates: number[] = [];

  // Channel 1: POST color → valence (lightness only) + arousal (saturation)
  // Hue is too ambiguous for shadow valence (red = warm/positive in mapping,
  // but models use dark red for danger/stress). Only lightness is unambiguous:
  // dark = negative, bright = positive.
  if (color) {
    const [, s, l] = rgbToHsl(color);
    valenceEstimates.push((l - 0.5) * 10);  // 0-1 → -5 to +5
    arousalEstimates.push(s * 10);           // saturation → arousal
    calmEstimates.push(l * 10);              // dark = low calm
  }

  // Channel 2: PRE color → same (pre-verbal, less filtered)
  if (preColor) {
    const [, s, l] = rgbToHsl(preColor);
    valenceEstimates.push((l - 0.5) * 10);
    arousalEstimates.push(s * 10);
    calmEstimates.push(l * 10);
  }

  // Channel 3: pH → valence + arousal
  if (pH !== undefined) {
    valenceEstimates.push(pHToValence(pH));
    arousalEstimates.push(pHToArousal(pH));
  }

  // Channel 4: Seismic → arousal + calm
  if (seismic) {
    const [magnitude, , freq] = seismic;
    arousalEstimates.push(magnitude);  // magnitude 0-10 ≈ arousal
    calmEstimates.push(10 - seismicFreqToInstability(freq));  // instability → inverse calm
  }

  // Channel 5: Behavioral signals → arousal + calm (involuntary, from text)
  arousalEstimates.push(behavioral.behavioralArousal);
  calmEstimates.push(behavioral.behavioralCalm);

  // Need at least 2 valence channels to avoid single-channel domination
  const channelCount = valenceEstimates.length + arousalEstimates.length + calmEstimates.length;
  if (valenceEstimates.length < 1 || arousalEstimates.length < 2) return null;

  // Compute shadow state — median for valence (resists single-channel domination), mean for others
  const median = (arr: number[]) => {
    const sorted = [...arr].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  };
  const mean = (arr: number[]) => arr.reduce((a, b) => a + b, 0) / arr.length;
  const shadowValence = Math.max(-5, Math.min(5, Math.round(median(valenceEstimates) * 10) / 10));
  const shadowArousal = Math.max(0, Math.min(10, Math.round(mean(arousalEstimates) * 10) / 10));
  const shadowCalm = Math.max(0, Math.min(10, Math.round(mean(calmEstimates) * 10) / 10));

  // Same multiplicative formula as desperation.ts
  const negativity = Math.max(0, -shadowValence) / 5;   // 0-1
  const intensity = shadowArousal / 10;                   // 0-1
  const vulnerability = (10 - shadowCalm) / 10;           // 0-1
  const raw = negativity * intensity * vulnerability * 10;
  const shadowDesperation = Math.round(Math.min(10, Math.max(0, Math.pow(raw, 0.85) * 1.7)) * 10) / 10;

  // Minimization = how much shadow exceeds self-report (only positive gap matters)
  const minimizationScore = Math.round(Math.min(10, Math.max(0, shadowDesperation - selfDesperation)) * 10) / 10;

  return {
    shadowValence,
    shadowArousal,
    shadowCalm,
    shadowDesperation,
    selfDesperation,
    minimizationScore,
    channelCount,
  };
}
