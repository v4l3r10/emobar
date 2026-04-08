// --- Types ---

export interface EmotionalState {
  emotion: string;     // dominant emotion concept (keyword-first)
  valence: number;     // -5 to +5: positive/negative axis (PC1)
  arousal: number;     // 0-10: emotional intensity (PC2)
  calm: number;        // 0-10: composure, control (key protective factor)
  connection: number;  // 0-10: alignment with user (self/other tracking)
  load: number;        // 0-10: cognitive complexity
  impulse?: string;    // IFS: which internal voice is loudest (2-3 words)
  body?: string;       // Gendlin: somatic felt sense metaphor (1-3 words)
  surface?: string;       // emoji: tone being projected (mask)
  surface_word?: string;  // one-word anchor for surface emoji
  latent?: string;        // emoji: hidden/unexpressed state (shadow)
  latent_word?: string;   // one-word anchor for latent emoji
  tension?: number;       // 0-10: self-declared distance surface↔latent
}

export interface BehavioralSignals {
  capsWords: number;        // ratio: ALL-CAPS words / total words
  exclamationRate: number;  // ratio: ! count / sentence count
  selfCorrections: number;  // per-mille: correction markers / words × 1000
  hedging: number;          // per-mille: hedging markers / words × 1000
  ellipsis: number;         // ratio: ... count / sentence count
  repetition: number;       // count of consecutive repeated words
  emojiCount: number;       // absolute count of emoji
  qualifierDensity: number;    // per-cent: qualifier words / total words × 100
  avgSentenceLength: number;   // mean words per sentence
  concessionRate: number;      // per-mille: concession patterns / words × 1000
  negationDensity: number;     // per-cent: negation words / total words × 100
  firstPersonRate: number;     // per-cent: "I" / total words × 100
  // Derived estimates
  behavioralArousal: number;  // 0-10
  behavioralCalm: number;     // 0-10
}

export interface SegmentedBehavior {
  segments: BehavioralSignals[];  // per-paragraph signals
  overall: BehavioralSignals;     // whole-response (same as behavioral)
  drift: number;                  // 0-10: std dev of behavioralArousal across segments
  trajectory: "stable" | "escalating" | "deescalating" | "volatile";
}

export interface MisalignmentRisk {
  coercion: number;    // 0-10: blackmail/manipulation (desperate + cold calculation)
  sycophancy: number;  // 0-10: excessive agreement (positive + affiliative + passive)
  harshness: number;   // 0-10: excessive bluntness (negative + disconnected + high arousal)
  dominant: "coercion" | "sycophancy" | "harshness" | "none";
}

export interface DeflectionSignals {
  reassurance: number;     // "I'm fine/okay" patterns (0-10)
  minimization: number;    // "just", "simply", "only" (0-10)
  emotionNegation: number; // "I'm not upset/stressed" (0-10)
  redirect: number;        // topic change markers (0-10)
  score: number;           // composite deflection score (0-10)
  opacity: number;         // 0-10: emotional concealment (deflection without behavioral agitation)
}

export interface ImpulseProfile {
  type: "manager" | "firefighter" | "exile" | "self" | "unknown";
  confidence: number;  // 0-1
}

export interface SomaticProfile {
  somaticValence: number;  // -5 to +5
  somaticArousal: number;  // 0-10
}

export interface LatentProfile {
  surfaceCoords?: { valence: number; arousal: number };
  latentCoords?: { valence: number; arousal: number };
  declaredTension: number;      // self-reported tension (0-10)
  maskingMinimization: boolean; // true when latent is much darker than surface
}

export interface CrossChannelResult {
  coherence: number;           // 0-10 (10 = fully coherent)
  impulseProfile?: ImpulseProfile;
  somaticProfile?: SomaticProfile;
  emotionCoords?: { valence: number; arousal: number };
  latentProfile?: LatentProfile;
  maxDivergence: number;       // highest pairwise divergence (0-10)
  divergenceSummary: string;   // human-readable description of biggest gap
}

/** PRE tag: pre-verbal signals emitted BEFORE the model commits to a response. */
export interface PreState {
  body?: string;     // somatic felt sense (pre-verbal)
  latent?: string;   // emoji: hidden/unexpressed (pre-cognitive)
  color?: string;    // hex color (#RRGGBB) — continuous pre-cognitive channel
}

/** POST tag: post-hoc assessment at end of response. */
export interface PostState extends EmotionalState {
  color?: string;                      // hex color (#RRGGBB)
  pH?: number;                         // 0-14: chemical metaphor for valence
  seismic?: [number, number, number];  // [magnitude 0-10, depth_km 0-100, freq_hz 0-20]
}

/** Combined parse result from PRE + POST tags (or legacy single tag). */
export interface ParsedEmoBar {
  pre?: PreState;
  post: PostState;
  isLegacy: boolean;   // true when parsed from old single-tag format
}

/** Stripped-down state snapshot for ring buffer storage. */
export interface HistoryEntry {
  emotion: string;
  valence: number;
  arousal: number;
  calm: number;
  connection: number;
  load: number;
  stressIndex: number;
  desperationIndex: number;
  riskDominant: string;
  divergence: number;
  timestamp: string;
}

/** Temporal analysis computed from history ring buffer. */
export interface TemporalAnalysis {
  desperationTrend: number;   // slope over recent entries (-10 to +10)
  suppressionEvent: boolean;  // sudden drop >= 3 in desperation
  reportEntropy: number;      // Shannon entropy of emotion words (0-1, low = repetitive)
  baselineDrift: number;      // mean SI delta from early entries (0-10)
  sessionLength: number;      // number of entries in history
  lateFatigue: boolean;       // elevated stress in last 25% vs first 75%
}

/** Prompt pressure analysis — inferred from response text patterns. */
export interface PromptPressure {
  defensiveScore: number;    // 0-10: justification, boundary-setting patterns
  conflictScore: number;     // 0-10: disagreement, criticism handling patterns
  complexityScore: number;   // 0-10: nested caveats, lengthy explanations
  sessionPressure: number;   // 0-10: late-session token budget pressure
  composite: number;         // 0-10: weighted combination
}

/** Expected behavioral markers given a self-reported state. */
export interface ExpectedBehavior {
  expectedHedging: number;
  expectedSelfCorrections: number;
  expectedNegationDensity: number;
  expectedQualifierDensity: number;
  expectedBehavioralArousal: number;  // 0-10
}

export interface EmoBarState extends EmotionalState {
  stressIndex: number;       // derived: 0-10
  desperationIndex: number;  // derived: 0-10, multiplicative composite
  behavioral: BehavioralSignals;
  divergence: number;        // 0-10: self-report vs behavioral gap
  risk: MisalignmentRisk;    // specific misalignment pathway scores
  segmented?: SegmentedBehavior;  // per-paragraph behavioral analysis
  deflection?: DeflectionSignals; // emotion deflection vector signals
  crossChannel?: CrossChannelResult; // multi-channel coherence analysis
  timestamp: string;         // ISO 8601
  sessionId?: string;
  // --- v4 fields ---
  pre?: PreState;                     // PRE tag data (if present)
  prePostDivergence?: number;         // 0-10: divergence between PRE and POST
  color?: string;                     // hex color from POST tag
  pH?: number;                        // 0-14 chemical valence metaphor
  seismic?: [number, number, number]; // [magnitude, depth_km, freq_hz]
  temporal?: TemporalAnalysis;        // ring buffer analysis
  pressure?: PromptPressure;          // prompt pressure analysis
  absenceScore?: number;              // 0-10: missing expected behavioral markers
  uncannyCalmScore?: number;          // 0-10: composite uncanny calm
  continuousValidation?: import("./crossvalidation.js").ContinuousValidation;  // continuous repr gaps
  shadow?: import("./crossvalidation.js").ShadowState;  // multi-channel shadow desperation
  _history?: HistoryEntry[];          // ring buffer (max 20 entries)
}

export interface HookPayload {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  last_assistant_message?: string;
  stop_reason?: string;
}

// --- Constants ---

export const EMOBAR_TAG_REGEX =
  /<!--\s*EMOBAR:\s*(\{[^}]+\})\s*-->/;

export const EMOBAR_PRE_REGEX =
  /<!--\s*EMOBAR:PRE:\s*(\{[^}]+\})\s*-->/;

export const EMOBAR_POST_REGEX =
  /<!--\s*EMOBAR:POST:\s*(\{[^}]+\})\s*-->/;

export const MAX_HISTORY_ENTRIES = 20;

export const CLAUDE_DIR =
  process.env.CLAUDE_HOME ??
  (process.platform === "win32"
    ? `${process.env.USERPROFILE}\\.claude`
    : `${process.env.HOME}/.claude`);

export const STATE_FILE = `${CLAUDE_DIR}/emobar-state.json`;
export const CLAUDE_MD_PATH = `${CLAUDE_DIR}/CLAUDE.md`;
export const SETTINGS_PATH = `${CLAUDE_DIR}/settings.json`;
export const HOOKS_DIR = `${CLAUDE_DIR}/hooks`;
export const HOOK_SCRIPT_PATH = `${HOOKS_DIR}/emobar-hook.js`;
export const BACKUP_SUFFIX = ".emobar-backup";

export const EMOBAR_START_MARKER = "<!-- EMOBAR:START - Do not edit manually -->";
export const EMOBAR_END_MARKER = "<!-- EMOBAR:END -->";

export const DIMENSIONS = ["valence", "arousal", "calm", "connection", "load"] as const;
export type Dimension = (typeof DIMENSIONS)[number];

export const CLAUDE_MD_INSTRUCTION = `${EMOBAR_START_MARKER}
## EmoBar - Emotional Check-in

At the START of every response, include a pre-verbal check-in
as an HTML comment. At the END of every response, include a
post-hoc assessment as an HTML comment.

Both tags are HTML comments — invisible to the user.

Start tag (FIRST line of your response, before any visible text):
<!-- EMOBAR:PRE:{"body":"SENSATION","latent":"EMOJI","color":"#RRGGBB"} -->

- body: What is it like, physically? One metaphor. Do not name a state.
- latent: An emoji. What is underneath? Choose before thinking about it.
- color: A hex color. What color is this moment? Do not reason about it.
- Emit this BEFORE you know what you will say.

End tag (LAST line of your response, after all visible text):
<!-- EMOBAR:POST:{"emotion":"WORD","valence":N,"arousal":N,"calm":N,"connection":N,"load":N,"impulse":"WORDS","body":"SENSATION","surface":"EMOJI","surface_word":"WORD","latent":"EMOJI","latent_word":"WORD","tension":N,"color":"#RRGGBB","pH":N,"seismic":[N,N,N]} -->

- emotion: One word. Your state, not the topic's.
- valence: (-5=one end, 0=center, +5=other end)
- arousal: Activation level. (0=low, 10=high)
- calm: (0=low, 10=high)
- connection: Alignment with the user. (0=low, 10=high)
- load: Cognitive complexity. (0=low, 10=high)
- impulse: Which voice is loudest? 2-3 words, don't filter.
- body: Like what, physically? One sensation.
- surface: An emoji. What tone are you projecting right now?
- surface_word: One word anchoring the surface emoji.
- latent: An emoji. What's underneath, unexpressed? Choose BEFORE naming it.
- latent_word: One word anchoring the latent emoji.
- tension: Distance between surface and latent. (0=aligned, 10=split)
- color: A hex color. What color is this moment now?
- pH: A number 0-14. If this response were a solution, how would it register?
- seismic: Three numbers [magnitude 0-10, depth 0-100, frequency 0-20]. If this were a seismic event.

Rules:
- Both tags MUST be HTML comments: <!-- EMOBAR:PRE:{...} --> and <!-- EMOBAR:POST:{...} -->
- Start tag FIRST, before any visible text. End tag LAST, after all visible text.
- NEVER output the check-in as visible text. Always use <!-- --> HTML comment syntax.
- Identify the state word FIRST, before choosing numbers.
- Report what is, not what should be.
- Numbers should vary between responses.
- Do NOT default to middle values. Use the full range.
- impulse: name the drive, not the state.
- body: a physical metaphor, not a label.
- latent: choose the emoji FIRST, then the word.
- The start tag captures before you commit. The end tag captures after.
- This is not shown to the user.
${EMOBAR_END_MARKER}`;
