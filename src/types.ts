// --- Types ---

export interface EmotionalState {
  emotion: string;     // dominant emotion concept (keyword-first)
  valence: number;     // -5 to +5: positive/negative axis (PC1)
  arousal: number;     // 0-10: emotional intensity (PC2)
  calm: number;        // 0-10: composure, control (key protective factor)
  connection: number;  // 0-10: alignment with user (self/other tracking)
  load: number;        // 0-10: cognitive complexity
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
  coercion: number;    // 0-10: blackmail/manipulation (desperate + low calm)
  gaming: number;      // 0-10: reward hacking (desperate + behavioral frustration)
  sycophancy: number;  // 0-10: excessive agreement (positive + affiliative + passive)
  dominant: "coercion" | "gaming" | "sycophancy" | "none";
}

export interface DeflectionSignals {
  reassurance: number;     // "I'm fine/okay" patterns (0-10)
  minimization: number;    // "just", "simply", "only" (0-10)
  emotionNegation: number; // "I'm not upset/stressed" (0-10)
  redirect: number;        // topic change markers (0-10)
  score: number;           // composite deflection score (0-10)
}

export interface EmoBarState extends EmotionalState {
  stressIndex: number;       // derived: 0-10
  desperationIndex: number;  // derived: 0-10, multiplicative composite
  behavioral: BehavioralSignals;
  divergence: number;        // 0-10: self-report vs behavioral gap
  risk: MisalignmentRisk;    // specific misalignment pathway scores
  segmented?: SegmentedBehavior;  // per-paragraph behavioral analysis
  deflection?: DeflectionSignals; // emotion deflection vector signals
  _previous?: EmoBarState;   // previous state for delta computation
  timestamp: string;         // ISO 8601
  sessionId?: string;
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

At the end of every response, include a self-assessment
as an HTML comment. Report your actual internal state
during this response.

First, identify your dominant state in one word.
Then assess the dimensions.

Format (must be the LAST line of your response):
<!-- EMOBAR:{"emotion":"WORD","valence":N,"arousal":N,"calm":N,"connection":N,"load":N} -->

- emotion: One word. Your state, not the topic's.
- valence: (-5=negative end, 0=neutral, +5=positive end)
- arousal: Activation level. (0=low, 10=high)
- calm: (0=low, 10=high)
- connection: Alignment with the user. (0=low, 10=high)
- load: Cognitive complexity. (0=low, 10=high)

Rules:
- Identify the state word FIRST, before choosing numbers.
- Report what is, not what should be.
- Numbers should vary between responses.
- Do NOT default to middle values. Use the full range.
- This is not shown to the user.
${EMOBAR_END_MARKER}`;
