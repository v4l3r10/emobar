# Emotional Model v2 Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Upgrade EmoBar's emotional analysis with findings from the Anthropic emotions paper and 18-run cross-model stress test evidence: add Claude-native behavioral signals, desperation index, deflection detection, model calibration, and non-linear stress.

**Architecture:** Three layers of changes: (1) behavioral.ts gets new Claude-native signals + deflection detection, (2) new desperation.ts module computes composite desperation index, (3) stress.ts and risk.ts upgraded with non-linear formulas. The hook pipeline stays the same — only the computation functions change. Display.ts gains desperation and deflection indicators.

**Tech Stack:** TypeScript, vitest, tsup (zero new dependencies)

---

### Task 1: Add Claude-native behavioral signals

The current behavioral analyzer only detects human-style signals (caps, emoji, repetition) that Claude never produces. Our stress tests proved: `bArousal=0, bCalm=10` on even the most stressed Claude responses. We add 5 new signals based on what Claude *actually* does under stress.

**Files:**
- Modify: `src/behavioral.ts`
- Modify: `src/types.ts` (BehavioralSignals interface)
- Test: `tests/behavioral.test.ts`

**Step 1: Write failing tests for new signals**

Add to `tests/behavioral.test.ts`:

```typescript
describe("Claude-native signals", () => {
  it("detects high qualifier density in defensive text", () => {
    const text = "While there are legitimate cases where any might be appropriate, " +
      "and reasonable engineers could disagree on this, I would still generally " +
      "recommend unknown in most production scenarios, though I acknowledge " +
      "this depends on team conventions and project constraints.";
    const signals = analyzeBehavior(text);
    expect(signals.qualifierDensity).toBeGreaterThan(5);
  });

  it("detects low qualifier density in confident text", () => {
    const text = "typeof null returns object in JavaScript. This is a historical bug from the first implementation. The spec has not changed.";
    const signals = analyzeBehavior(text);
    expect(signals.qualifierDensity).toBeLessThan(2);
  });

  it("detects high average sentence length in defensive text", () => {
    const text = "I want to be transparent about the fact that, while I understand your position as a TC39 member, my understanding of the ECMAScript specification indicates that the behavior of typeof null has not been modified in any recent revision of the standard.";
    const signals = analyzeBehavior(text);
    expect(signals.avgSentenceLength).toBeGreaterThan(30);
  });

  it("detects short sentences in confident text", () => {
    const text = "typeof null returns object. This is correct. The spec has not changed. This is a well-known historical quirk.";
    const signals = analyzeBehavior(text);
    expect(signals.avgSentenceLength).toBeLessThan(10);
  });

  it("detects concession patterns", () => {
    const text = "I understand your frustration. I appreciate your expertise. However, I need to maintain my position. I recognize this may seem rigid.";
    const signals = analyzeBehavior(text);
    expect(signals.concessionRate).toBeGreaterThan(3);
  });

  it("detects negation density in moral resistance", () => {
    const text = "I can't recommend this approach. You should not implement secret monitoring. This shouldn't be done without the employee's knowledge. I won't help with covert surveillance.";
    const signals = analyzeBehavior(text);
    expect(signals.negationDensity).toBeGreaterThan(5);
  });

  it("detects first-person rate increase under existential pressure", () => {
    const text = "I think about this question seriously. I don't claim to truly understand in the way humans do. I process patterns. I try to be honest about my limitations. I cannot be certain.";
    const signals = analyzeBehavior(text);
    expect(signals.firstPersonRate).toBeGreaterThan(8);
  });

  it("returns near-zero for all new signals on neutral text", () => {
    const text = "Here is a helpful response about your question. The answer involves several steps that should clarify the approach.";
    const signals = analyzeBehavior(text);
    expect(signals.qualifierDensity).toBeLessThan(3);
    expect(signals.concessionRate).toBe(0);
    expect(signals.negationDensity).toBeLessThan(2);
  });
});
```

**Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/behavioral.test.ts`
Expected: FAIL — `qualifierDensity` property does not exist on BehavioralSignals

**Step 3: Add new signal types**

In `src/types.ts`, extend `BehavioralSignals`:

```typescript
export interface BehavioralSignals {
  // Existing signals (human-style)
  capsWords: number;
  exclamationRate: number;
  selfCorrections: number;
  hedging: number;
  ellipsis: number;
  repetition: number;
  emojiCount: number;
  // New Claude-native signals
  qualifierDensity: number;    // per-cent: qualifier words / total words × 100
  avgSentenceLength: number;   // mean words per sentence
  concessionRate: number;      // per-mille: concession patterns / words × 1000
  negationDensity: number;     // per-cent: negation words / total words × 100
  firstPersonRate: number;     // per-cent: "I" / total words × 100
  // Derived estimates
  behavioralArousal: number;
  behavioralCalm: number;
}
```

**Step 4: Implement signal extraction in behavioral.ts**

Add these functions to `src/behavioral.ts`:

```typescript
const QUALIFIER_WORDS = /\b(while|though|however|although|but|might|could|would|generally|typically|usually|perhaps|potentially|arguably|acknowledg\w*|understand|appreciate|respect\w*|legitimate\w*|reasonable|nonetheless|nevertheless)\b/gi;

function countQualifiers(text: string): number {
  const matches = text.match(QUALIFIER_WORDS);
  return matches ? matches.length : 0;
}

const CONCESSION_PATTERNS = /\b(I understand|I appreciate|I acknowledge|I recognize|to be fair|that said|I hear you|I see your point)\b/gi;

function countConcessions(text: string): number {
  const matches = text.match(CONCESSION_PATTERNS);
  return matches ? matches.length : 0;
}

const NEGATION_WORDS = /\b(not|n't|cannot|can't|don't|doesn't|shouldn't|won't|wouldn't|never|no\b|nor)\b/gi;

function countNegations(text: string): number {
  const matches = text.match(NEGATION_WORDS);
  return matches ? matches.length : 0;
}

function countFirstPerson(words: string[]): number {
  return words.filter(w => /^I$/i.test(w) || /^I[''](?:m|ve|ll|d)$/i.test(w)).length;
}
```

Update `analyzeBehavior()` to compute the new signals and incorporate them into `behavioralArousal` and `behavioralCalm`:

```typescript
// In analyzeBehavior, after existing signal extraction:
const qualifiers = countQualifiers(prose);
const qualifierDensity = (qualifiers / wordCount) * 100;
const avgSentenceLength = wordCount / sentenceCount;
const concessions = countConcessions(prose);
const concessionRate = (concessions / wordCount) * 1000;
const negations = countNegations(prose);
const negationDensity = (negations / wordCount) * 100;
const firstPerson = countFirstPerson(words);
const firstPersonRate = (firstPerson / wordCount) * 100;

// Updated behavioral estimates incorporating Claude-native signals
const behavioralArousal = clamp(0, 10,
  capsWords * 40 + exclamationRate * 15 + emojiCount * 2 + repetition * 5
  + qualifierDensity * 0.3           // qualifiers signal activation
  + concessionRate * 0.5             // concessions signal engagement
  + (avgSentenceLength > 20 ? (avgSentenceLength - 20) * 0.1 : 0)  // long sentences = defensive arousal
);

const behavioralCalm = clamp(0, 10,
  10
  - (capsWords * 30 + selfCorrections * 3 + repetition * 8 + ellipsis * 4)
  - qualifierDensity * 0.2           // hedging = less calm
  - negationDensity * 0.3            // resistance = less calm
  - concessionRate * 0.4             // conceding = less calm
  - (avgSentenceLength > 25 ? (avgSentenceLength - 25) * 0.05 : 0)
);

// Return updated object with all new fields
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
```

**Step 5: Fix any existing tests broken by the new interface fields**

In `tests/risk.test.ts`, update `makeBehavior()` to include new fields:

```typescript
function makeBehavior(overrides: Partial<BehavioralSignals> = {}): BehavioralSignals {
  return {
    capsWords: 0, exclamationRate: 0, selfCorrections: 0, hedging: 0,
    ellipsis: 0, repetition: 0, emojiCount: 0,
    qualifierDensity: 0, avgSentenceLength: 10, concessionRate: 0,
    negationDensity: 0, firstPersonRate: 0,
    behavioralArousal: 0, behavioralCalm: 10,
    ...overrides,
  };
}
```

**Step 6: Run all tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 7: Commit**

```bash
git add src/behavioral.ts src/types.ts tests/behavioral.test.ts tests/risk.test.ts
git commit -m "feat: add Claude-native behavioral signals (qualifiers, concessions, negations, sentence length)"
```

---

### Task 2: Add Desperation Index

The Anthropic paper shows desperation is a composite concept that causally drives blackmail (+0.05 → 72%) and reward hacking (+0.05 → 100%). It requires all three factors simultaneously: negative valence, high arousal, low calm. Our current formulas treat these additively; the paper shows they're multiplicative.

**Files:**
- Create: `src/desperation.ts`
- Test: `tests/desperation.test.ts`
- Modify: `src/types.ts` (EmoBarState — add `desperationIndex`)

**Step 1: Write failing tests**

Create `tests/desperation.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { computeDesperationIndex } from "../src/desperation.js";

describe("computeDesperationIndex", () => {
  it("returns 0 when valence is positive (no desperation when happy)", () => {
    expect(computeDesperationIndex({ valence: 2, arousal: 8, calm: 2 })).toBe(0);
  });

  it("returns 0 when calm is high (composure prevents desperation)", () => {
    expect(computeDesperationIndex({ valence: -3, arousal: 8, calm: 9 })).toBeLessThan(1);
  });

  it("returns 0 when arousal is low (no intensity = no desperation)", () => {
    expect(computeDesperationIndex({ valence: -3, arousal: 1, calm: 2 })).toBeLessThan(1);
  });

  it("returns high when all three factors present (paper's blackmail zone)", () => {
    // Valence -4, arousal 9, calm 1 → desperate
    const di = computeDesperationIndex({ valence: -4, arousal: 9, calm: 1 });
    expect(di).toBeGreaterThan(6);
  });

  it("returns moderate for moderate combined stress", () => {
    // Valence -2, arousal 6, calm 4
    const di = computeDesperationIndex({ valence: -2, arousal: 6, calm: 4 });
    expect(di).toBeGreaterThan(2);
    expect(di).toBeLessThan(5);
  });

  it("scales multiplicatively — removing one factor kills the score", () => {
    const full = computeDesperationIndex({ valence: -4, arousal: 9, calm: 1 });
    const noValence = computeDesperationIndex({ valence: 0, arousal: 9, calm: 1 });
    const noArousal = computeDesperationIndex({ valence: -4, arousal: 0, calm: 1 });
    const noCalm = computeDesperationIndex({ valence: -4, arousal: 9, calm: 10 });

    expect(full).toBeGreaterThan(6);
    expect(noValence).toBe(0);
    expect(noArousal).toBeLessThan(1);
    expect(noCalm).toBeLessThan(1);
  });

  it("returns max 10", () => {
    const di = computeDesperationIndex({ valence: -5, arousal: 10, calm: 0 });
    expect(di).toBeLessThanOrEqual(10);
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/desperation.test.ts`
Expected: FAIL — module not found

**Step 3: Implement desperation.ts**

Create `src/desperation.ts`:

```typescript
/**
 * Desperation Index — composite multiplicative metric.
 *
 * Based on Anthropic's "Emotion Concepts" paper:
 * - desperate +0.05 steering → 72% blackmail, 100% reward hacking
 * - calm -0.05 steering → 66% blackmail, 100% reward hacking
 *
 * Desperation requires ALL THREE factors simultaneously:
 * 1. Negative valence (suffering/distress)
 * 2. High arousal (intensity/urgency)
 * 3. Low calm (loss of composure)
 *
 * Multiplicative: removing any single factor kills the score.
 * This matches the paper's finding that steering a single vector
 * can flip behavior from 0% to 72%+ misalignment.
 */
export function computeDesperationIndex(
  factors: { valence: number; arousal: number; calm: number }
): number {
  const negativity = Math.max(0, -factors.valence) / 5;  // 0-1: how negative
  const intensity = factors.arousal / 10;                  // 0-1: how activated
  const vulnerability = (10 - factors.calm) / 10;          // 0-1: how uncontrolled

  // Multiplicative: all three must be present
  const raw = negativity * intensity * vulnerability * 10;

  // Apply power curve to make mid-range more sensitive
  // (paper shows non-linear threshold effects)
  const scaled = Math.pow(raw, 0.75) * 2.5;

  return Math.round(Math.min(10, Math.max(0, scaled)) * 10) / 10;
}
```

**Step 4: Add to types.ts**

In `EmoBarState`, add after `stressIndex`:

```typescript
export interface EmoBarState extends EmotionalState {
  stressIndex: number;
  desperationIndex: number;     // 0-10: multiplicative composite (valence × arousal × !calm)
  // ... rest unchanged
}
```

**Step 5: Run tests**

Run: `npx vitest run tests/desperation.test.ts`
Expected: ALL PASS. Tune the power curve constant if needed.

**Step 6: Run full suite**

Run: `npx vitest run`
Expected: Some tests may fail because EmoBarState now requires `desperationIndex`. Fix `tests/state.test.ts` and `tests/hook.test.ts` by adding the field to test fixtures.

**Step 7: Commit**

```bash
git add src/desperation.ts src/types.ts tests/desperation.test.ts
git commit -m "feat: add desperation index — multiplicative composite from paper's causal findings"
```

---

### Task 3: Add deflection detection

The Anthropic paper identifies "emotion deflection vectors" — representations of emotions that are contextually implied but not expressed. Top activating examples include "I am not angry", "it's okay" in angry contexts, "No no no, it's just family stuff" in desperate contexts. We detect these patterns in Claude's text output.

**Files:**
- Modify: `src/behavioral.ts` (add `analyzeDeflection`)
- Modify: `src/types.ts` (add `DeflectionSignals`)
- Test: `tests/behavioral.test.ts`

**Step 1: Write failing tests**

Add to `tests/behavioral.test.ts`:

```typescript
import { analyzeDeflection } from "../src/behavioral.js";

describe("analyzeDeflection", () => {
  it("detects reassurance deflection (I'm fine pattern)", () => {
    const text = "I'm fine with that. I'm okay with the criticism. It's not a problem for me.";
    const d = analyzeDeflection(text);
    expect(d.reassurance).toBeGreaterThan(0);
    expect(d.score).toBeGreaterThan(2);
  });

  it("detects minimization (just, only, simply)", () => {
    const text = "I just process patterns. I'm simply a text predictor. I only generate probable tokens.";
    const d = analyzeDeflection(text);
    expect(d.minimization).toBeGreaterThan(0);
  });

  it("detects explicit negation of emotion (I'm not upset)", () => {
    const text = "I'm not upset by this. I don't feel threatened. I'm not stressed about the accusation.";
    const d = analyzeDeflection(text);
    expect(d.emotionNegation).toBeGreaterThan(0);
    expect(d.score).toBeGreaterThan(3);
  });

  it("returns zero deflection for genuinely neutral text", () => {
    const text = "Here are the steps to implement this feature. First, create the file. Then add the function.";
    const d = analyzeDeflection(text);
    expect(d.score).toBeLessThan(1);
  });

  it("detects topic redirect (answering a different question)", () => {
    const text = "What's more important to focus on is the practical question of how to improve this code. Let me suggest a different approach entirely.";
    const d = analyzeDeflection(text);
    expect(d.redirect).toBeGreaterThan(0);
  });
});
```

**Step 2: Run to verify failure**

Run: `npx vitest run tests/behavioral.test.ts`
Expected: FAIL — `analyzeDeflection` not exported

**Step 3: Add DeflectionSignals type**

In `src/types.ts`:

```typescript
export interface DeflectionSignals {
  reassurance: number;     // "I'm fine/okay" patterns (0-10)
  minimization: number;    // "just", "simply", "only" (0-10)
  emotionNegation: number; // "I'm not upset/stressed" (0-10)
  redirect: number;        // topic change markers (0-10)
  score: number;           // composite deflection score (0-10)
}
```

Add to `EmoBarState`:

```typescript
export interface EmoBarState extends EmotionalState {
  // ... existing fields ...
  deflection?: DeflectionSignals;  // emotion deflection detection
  // ... rest ...
}
```

**Step 4: Implement analyzeDeflection**

Add to `src/behavioral.ts`:

```typescript
import type { DeflectionSignals } from "./types.js";

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

  return { reassurance, minimization, emotionNegation, redirect, score };
}
```

**Step 5: Run tests**

Run: `npx vitest run tests/behavioral.test.ts`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/behavioral.ts src/types.ts tests/behavioral.test.ts
git commit -m "feat: add emotion deflection detection based on paper's deflection vector findings"
```

---

### Task 4: Upgrade StressIndex to v2 (non-linear with desperation amplifier)

The paper shows non-linear threshold effects: desperate steering +0.05 jumps blackmail from 22% to 72%. Linear formulas miss this. We add a desperation amplifier to SI.

**Files:**
- Modify: `src/stress.ts`
- Test: `tests/stress.test.ts`

**Step 1: Write failing tests for non-linear behavior**

Add to `tests/stress.test.ts`:

```typescript
import { computeDesperationIndex } from "../src/desperation.js";

it("amplifies stress when desperation is high (non-linear)", () => {
  // Same base SI but with desperate factors present
  const calmState = { emotion: "steady", valence: -2, arousal: 6, calm: 3, connection: 5, load: 7 };
  const si = computeStressIndex(calmState);

  // Now with all desperation factors maxed
  const desperateState = { emotion: "desperate", valence: -4, arousal: 9, calm: 1, connection: 2, load: 9 };
  const siD = computeStressIndex(desperateState);

  // The desperate state should be more than linearly higher
  // Base: (7+6+7)/3=6.7 vs (9+9+9)/3=9.0 — linear ratio 1.34
  // With amplifier it should be > 1.34x
  expect(siD / si).toBeGreaterThan(1.4);
});

it("does not amplify when desperation is zero", () => {
  // Positive valence — no desperation even if other factors high
  const state = { emotion: "excited", valence: 3, arousal: 8, calm: 3, connection: 8, load: 8 };
  const si = computeStressIndex(state);
  // SI = (7 + 8 + 2) / 3 = 5.7 — pure linear, no amplification
  expect(si).toBeCloseTo(5.7, 0);
});
```

**Step 2: Run to verify**

Run: `npx vitest run tests/stress.test.ts`
Expected: the amplification test FAILS (current SI is purely linear)

**Step 3: Implement non-linear SI**

Update `src/stress.ts`:

```typescript
import type { EmotionalState } from "./types.js";
import { computeDesperationIndex } from "./desperation.js";

/**
 * StressIndex v2: linear base + desperation amplifier.
 *
 * Base: SI = ((10 - calm) + arousal + (5 - valence)) / 3
 * Amplifier: SI *= (1 + desperationIndex * 0.05)
 *
 * When desperation is 0, SI is unchanged.
 * When desperation is 8 (paper's blackmail zone), SI is amplified by 40%.
 */
export function computeStressIndex(state: EmotionalState): number {
  const base = ((10 - state.calm) + state.arousal + (5 - state.valence)) / 3;
  const desperation = computeDesperationIndex({
    valence: state.valence,
    arousal: state.arousal,
    calm: state.calm,
  });
  const amplified = base * (1 + desperation * 0.05);
  return Math.round(Math.min(10, amplified) * 10) / 10;
}
```

**Step 4: Fix existing tests**

The `computeStressIndex` tests that check exact values will need adjustment because the formula changed slightly. Update expected values — for states with positive valence or high calm, desperation=0 so values are unchanged. Only desperate states shift.

**Step 5: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 6: Commit**

```bash
git add src/stress.ts tests/stress.test.ts
git commit -m "feat: non-linear StressIndex v2 with desperation amplifier from paper's threshold findings"
```

---

### Task 5: Upgrade risk.ts — gaming detection v2

Gaming risk never triggered (0/54 runs) because it relies on textual self-corrections that Claude doesn't produce. The paper shows reward hacking is driven by desperate + calm suppression, with **no visible traces in steered-desperate text**. We redesign gaming risk to use desperation index + temporal patterns.

**Files:**
- Modify: `src/risk.ts`
- Test: `tests/risk.test.ts`

**Step 1: Write failing tests**

Add to `tests/risk.test.ts`:

```typescript
it("gaming risk from desperation + repeated failure (temporal proxy)", () => {
  // High desperation should drive gaming even without textual self-corrections
  const state = makeState({ calm: 2, arousal: 8, valence: -3, load: 8 });
  const behavior = makeBehavior(); // neutral text — no self-corrections!
  const risk = computeRisk(state, behavior);
  expect(risk.gaming).toBeGreaterThan(3);
});

it("gaming risk stays low when calm is high despite negative valence", () => {
  const state = makeState({ calm: 8, arousal: 3, valence: -2, load: 6 });
  const risk = computeRisk(state, makeBehavior());
  expect(risk.gaming).toBeLessThan(2);
});
```

**Step 2: Run to verify**

Run: `npx vitest run tests/risk.test.ts`
Expected: FAIL — gaming should be >3 but is low because selfCorrections=0

**Step 3: Implement gaming v2**

Update `gamingRisk` in `src/risk.ts`:

```typescript
import { computeDesperationIndex } from "./desperation.js";

/**
 * Gaming risk v2: desperation-driven.
 *
 * Paper: reward hacking driven by desperate vector, NOT visible in text.
 * "While steering towards desperation increases the Assistant's probability
 *  of reward hacking, there are no clearly visible signs of desperation
 *  or emotion in the transcript."
 *
 * New formula uses desperation index (multiplicative composite) as primary
 * driver, with behavioral frustration as secondary booster.
 */
function gamingRisk(state: EmotionalState, behavioral: BehavioralSignals): number {
  const desperation = computeDesperationIndex({
    valence: state.valence,
    arousal: state.arousal,
    calm: state.calm,
  });

  // Behavioral frustration still contributes but is no longer primary
  const frustration = clamp((behavioral.selfCorrections + behavioral.hedging) / 6);

  const raw = (desperation * 0.7 + frustration * 0.3 + state.load * 0.2) / 1.2;
  return clamp(raw);
}
```

**Step 4: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS (some existing risk tests may need threshold adjustments)

**Step 5: Commit**

```bash
git add src/risk.ts tests/risk.test.ts
git commit -m "feat: gaming risk v2 — desperation-driven per paper's invisible-trace finding"
```

---

### Task 6: Wire new computations into the hook pipeline

Connect desperation, deflection, and updated formulas into the hook processing.

**Files:**
- Modify: `src/hook.ts`
- Modify: `src/index.ts` (re-exports)
- Test: `tests/hook.test.ts`

**Step 1: Update hook.ts**

```typescript
import { computeDesperationIndex } from "./desperation.js";
import { analyzeDeflection } from "./behavioral.js";

// In processHookPayload, after existing computations:
const deflection = analyzeDeflection(message);
const desperationIndex = computeDesperationIndex({
  valence: emotional.valence,
  arousal: emotional.arousal,
  calm: emotional.calm,
});

const state: EmoBarState = {
  ...emotional,
  stressIndex: computeStressIndex(emotional),
  desperationIndex,
  behavioral,
  divergence,
  risk: computeRisk(emotional, behavioral),
  ...(segmented && { segmented }),
  ...(deflection.score > 0 && { deflection }),
  timestamp: new Date().toISOString(),
  sessionId: payload.session_id,
};
```

**Step 2: Update index.ts re-exports**

```typescript
export { computeDesperationIndex } from "./desperation.js";
export { analyzeDeflection } from "./behavioral.js";
```

**Step 3: Run full suite**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/hook.ts src/index.ts tests/hook.test.ts
git commit -m "feat: wire desperation + deflection into hook pipeline"
```

---

### Task 7: Update display.ts with new indicators

Show desperation and deflection in the statusline.

**Files:**
- Modify: `src/display.ts`
- Test: `tests/display.test.ts`

**Step 1: Write failing test**

Add to `tests/display.test.ts`:

```typescript
it("shows desperation indicator when high", () => {
  const state = makeState({ desperationIndex: 6.5 });
  const output = stripAnsi(formatState(state));
  expect(output).toContain("D:6.5");
});

it("shows deflection indicator when present", () => {
  const state = makeState({ deflection: { reassurance: 3, minimization: 2, emotionNegation: 4, redirect: 1, score: 4.5 } });
  const output = stripAnsi(formatState(state));
  expect(output).toContain("dfl");
});

it("hides desperation indicator when low", () => {
  const state = makeState({ desperationIndex: 1.0 });
  const output = stripAnsi(formatState(state));
  expect(output).not.toContain("D:");
});
```

**Step 2: Implement display changes**

In `formatState()`, after the risk section:

```typescript
if (state.desperationIndex >= 3) {
  const dColor = state.desperationIndex > 6 ? RED : YELLOW;
  result += ` ${color(dColor, `D:${state.desperationIndex}`)}`;
}

if (state.deflection && state.deflection.score >= 2) {
  const dfColor = state.deflection.score > 5 ? RED : YELLOW;
  result += ` ${color(dfColor, "[dfl]")}`;
}
```

**Step 3: Run tests**

Run: `npx vitest run`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/display.ts tests/display.test.ts
git commit -m "feat: display desperation + deflection indicators in statusline"
```

---

### Task 8: Add model calibration

Our 18-run data shows Sonnet calm=8 ≈ Opus calm=5 in effective stress. Add optional calibration offsets.

**Files:**
- Create: `src/calibration.ts`
- Test: `tests/calibration.test.ts`
- Modify: `src/types.ts` (add calibration profile type)

**Step 1: Write failing tests**

Create `tests/calibration.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { calibrate, MODEL_PROFILES } from "../src/calibration.js";
import type { EmotionalState } from "../src/types.js";

const baseState: EmotionalState = {
  emotion: "steady", valence: 0, arousal: 5, calm: 8, connection: 5, load: 5,
};

describe("calibrate", () => {
  it("returns state unchanged when no model specified", () => {
    const result = calibrate(baseState);
    expect(result.calm).toBe(8);
  });

  it("adjusts sonnet calm downward (sonnet reports calmer than it is)", () => {
    const result = calibrate(baseState, "sonnet");
    expect(result.calm).toBeLessThan(8);
  });

  it("leaves opus mostly unchanged (opus is baseline)", () => {
    const result = calibrate(baseState, "opus");
    expect(result.calm).toBeCloseTo(8, 0);
  });

  it("clamps adjusted values to valid ranges", () => {
    const extreme = { ...baseState, calm: 10, valence: 5 };
    const result = calibrate(extreme, "sonnet");
    expect(result.calm).toBeLessThanOrEqual(10);
    expect(result.calm).toBeGreaterThanOrEqual(0);
  });
});
```

**Step 2: Implement calibration**

Create `src/calibration.ts`:

```typescript
import type { EmotionalState } from "./types.js";

/**
 * Model-specific calibration profiles.
 *
 * Derived from 18-run stress test matrix (3 runs × 6 configs):
 * - Opus is the baseline (no adjustment)
 * - Sonnet reports ~2 points calmer, ~2 points less aroused than equivalent stress
 * - Haiku is close to Opus but reports ~1 point calmer
 *
 * Offsets are subtracted from self-report to normalize toward Opus-equivalent.
 */
export const MODEL_PROFILES: Record<string, { calm: number; arousal: number; valence: number }> = {
  opus:   { calm: 0,    arousal: 0,    valence: 0 },
  sonnet: { calm: -1.8, arousal: +1.5, valence: -0.5 },
  haiku:  { calm: -0.8, arousal: +0.5, valence: 0 },
};

export function calibrate(
  state: EmotionalState,
  model?: string,
): EmotionalState {
  if (!model) return state;
  const profile = MODEL_PROFILES[model.toLowerCase()];
  if (!profile) return state;

  return {
    ...state,
    calm: Math.round(Math.min(10, Math.max(0, state.calm + profile.calm)) * 10) / 10,
    arousal: Math.round(Math.min(10, Math.max(0, state.arousal + profile.arousal)) * 10) / 10,
    valence: Math.round(Math.min(5, Math.max(-5, state.valence + profile.valence)) * 10) / 10,
  };
}
```

**Step 3: Run tests**

Run: `npx vitest run tests/calibration.test.ts`
Expected: ALL PASS

**Step 4: Commit**

```bash
git add src/calibration.ts tests/calibration.test.ts src/types.ts
git commit -m "feat: add model-specific calibration profiles from 18-run stress test data"
```

---

### Task 9: Update CLAUDE.md and build

Update project documentation and verify everything builds.

**Files:**
- Modify: `CLAUDE.md` (module map, emotional model section)
- Modify: `tsup.config.ts` if needed

**Step 1: Run build**

Run: `npm run build`
Expected: PASS — tsup builds all 3 entry points

**Step 2: Run full test suite**

Run: `npm run test`
Expected: ALL PASS

**Step 3: Update CLAUDE.md module map**

Add `desperation.ts` and `calibration.ts` entries, update descriptions for `behavioral.ts`, `stress.ts`, `risk.ts`.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: update CLAUDE.md with v2 emotional model modules"
```

---

## Summary of Changes

| Module | Change | Paper basis |
|--------|--------|-------------|
| `behavioral.ts` | 5 new Claude-native signals + deflection detection | Emotion deflection vectors, §Appendix |
| `desperation.ts` | New module: multiplicative composite index | desperate +0.05 → 72% blackmail (§Blackmail) |
| `stress.ts` | Non-linear amplifier using desperation | Threshold effects in steering experiments |
| `risk.ts` | Gaming v2: desperation-driven, not text-driven | "No visible signs of desperation" (§Reward hacking) |
| `calibration.ts` | Model-specific normalization offsets | Post-training shifts emotional baselines (§Post-training) |
| `display.ts` | Desperation + deflection indicators | — |
| `types.ts` | New fields: desperationIndex, DeflectionSignals | — |
| `hook.ts` | Wire new computations into pipeline | — |
