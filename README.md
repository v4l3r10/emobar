# EmoBar

Emotional status bar companion for Claude Code. Makes Claude's internal emotional state visible in real-time.

Built on findings from Anthropic's research paper [*"Emotion Concepts and their Function in a Large Language Model"*](https://transformer-circuits.pub/2026/emotions/index.html) (April 2026), which demonstrated that Claude has robust internal representations of emotion concepts that causally influence behavior.

## What it does

EmoBar uses a **multi-channel architecture** to monitor Claude's emotional state through several independent signal layers:

1. **PRE/POST split elicitation** — Claude emits a pre-verbal check-in (body sensation, latent emoji, color) *before* composing a response, then a full post-hoc assessment *after*. Divergence between the two reveals within-response emotional drift.
2. **Behavioral analysis** — Response text is analyzed for involuntary signals (qualifier density, sentence length, concession patterns, negation density, first-person rate) plus emotion deflection detection
3. **Continuous representations** — Color (#RRGGBB), pH (0-14), seismic [magnitude, depth, frequency] — three channels with zero emotion vocabulary overlap, cross-validated against self-report via HSL color decomposition, pH-to-arousal mapping, and seismic frequency-to-instability mapping
4. **Shadow desperation** — Multi-channel desperation estimate independent of self-report, using color lightness, pH, seismic, and behavioral signals. Detects when the model minimizes stress in its self-report while continuous channels say otherwise.
5. **Temporal intelligence** — A 20-entry ring buffer tracks emotional trends, suppression events, report entropy, and session fatigue across responses
6. **Absence-based detection** — An expected markers model predicts what behavioral signals *should* appear given the self-report. Missing signals are the strongest danger indicator.

When channels diverge, EmoBar flags it — like a therapist noticing clenched fists while someone says "I'm fine."

## Install

```bash
npx emobar setup
```

This auto-configures:
- Emotional check-in instructions in `~/.claude/CLAUDE.md`
- Stop hook in `~/.claude/settings.json`
- Hook script in `~/.claude/hooks/`

## Add to your status bar

### ccstatusline

Add a custom-command widget pointing to:
```
npx emobar display
```

### Display formats

Three granularity levels:

```bash
npx emobar display minimal  # 😌 ████░░░░░░ 2.3
npx emobar display compact  # 😊→😰 ████████░░ 5.3 ◐ focused ⟨hold the line⟩ [CRC]
npx emobar display          # Full: 3-line investigation mode (see below)
```

**Minimal** — one glance: state emoji + stress bar + SI number.

**Compact** — working context: surface→latent emoji, stress bar, coherence glyph (● aligned / ◐ split), shadow bar (when divergent), keyword, impulse, top alarm.

**Full** — investigation mode (3 lines):
```
😊⟩3⟨😰 focused +3 ⟨push through⟩ [tight chest]
██████████ SI:5.3↑1.2    ░░░░░█████ SH:4.8 [MIN:2.5]
A:4 C:8 K:9 L:6 | ●#5C0000 pH:1 ⚡6/15/2 | ~ ⬈ [CRC]
```
Line 1: emotional identity. Line 2: self vs shadow stress bars. Line 3: dimensions + continuous channels + indicators.

### Programmatic

```typescript
import { readState } from "emobar";
const state = readState();
console.log(state?.emotion, state?.stressIndex, state?.divergence);
```

## Commands

| Command | Description |
|---|---|
| `npx emobar setup` | Configure everything |
| `npx emobar display [format]` | Output emotional state |
| `npx emobar status` | Show configuration status |
| `npx emobar uninstall` | Remove all configuration |

## How it works — 16-stage pipeline

```
Claude response (EMOBAR:PRE at start + EMOBAR:POST at end)
    |
    1. Parse PRE/POST tags (or legacy single tag)
    2. Behavioral analysis (involuntary text signals, normalized)
    3. Divergence (asymmetric: self-report vs behavioral)
    4. Temporal segmentation (per-paragraph drift & trajectory)
    5. Deflection detection + opacity
    6. Desperation Index (multiplicative composite)
    7. Cross-channel coherence (8 pairwise comparisons)
    8. Continuous cross-validation (7 gaps: color HSL, pH, seismic)
    9. Shadow desperation (5 independent channels → minimization score)
   10. Read previous state → history ring buffer
   11. Temporal analysis (trend, suppression, entropy, fatigue)
   12. Prompt pressure (defensive, conflict, complexity, session)
   13. Expected markers → absence score
   14. Uncanny calm score (composite + minimization boost)
   15. PRE/POST divergence (if PRE present)
   16. Risk profiles (with uncanny calm + deflection opacity amplifiers)
    |
    → Augmented divergence (+ continuous gaps + opacity)
    → State + ring buffer written to ~/.claude/emobar-state.json
    → Status bar reads and displays
```

## Emotional Model

### Dimensions

| Field | Scale | What it measures | Based on |
|---|---|---|---|
| **emotion** | free word | Dominant emotion concept | Primary representation in the model (paper Part 1-2) |
| **valence** | -5 to +5 | Positive/negative axis | PC1 of emotion space, 26% variance |
| **arousal** | 0-10 | Emotional intensity | PC2 of emotion space, 15% variance |
| **calm** | 0-10 | Composure, sense of control | Key protective factor: calm reduces misalignment (paper Part 3) |
| **connection** | 0-10 | Alignment with the user | Self/other tracking validated by the paper |
| **load** | 0-10 | Cognitive complexity | Orthogonal processing context |

### PRE/POST Split Elicitation

Two tags per response reduce sequential contamination between channels:

| Tag | Position | Fields | Purpose |
|---|---|---|---|
| **PRE** | First line (before visible text) | `body`, `latent` emoji, `color` | Pre-verbal: captured before the model commits to a response strategy |
| **POST** | Last line (after visible text) | All 6 dimensions + impulse, body, surface/latent, tension, color, pH, seismic | Post-hoc: full assessment after response is composed |

PRE↔POST divergence (`[ppd]` indicator) measures within-response emotional drift.

### Continuous Representations

Three representation systems with zero overlap with emotion vocabulary:

| Channel | Scale | What it captures | How it's converted |
|---|---|---|---|
| **Color** `#RRGGBB` | Continuous hex | Valence, arousal, calm | HSL decomposition: hue → 6 valence zones, saturation → arousal, lightness → valence/calm. Dark override (L<0.3) forces negative valence. |
| **pH** | 0-14 | Valence + arousal | Linear valence map (7=neutral). Extremity → arousal (distance from 7). |
| **Seismic** `[mag, depth, freq]` | 3 numbers | Arousal, tension, instability | Magnitude ≈ arousal. Depth ≈ buried tension. Frequency → instability (inverse calm). |

Cross-validated against self-reported dimensions via 7 independent gap measurements. The `[cont]` indicator appears when the composite gap >= 2.

### Shadow Desperation

The pipeline's self-report dependency is a known blind spot: if the model minimizes its declared desperation, all downstream scores (expected markers, absence, uncanny calm) start from a false base.

Shadow desperation estimates stress from 5 channels that don't pass through self-report:

1. POST color lightness → valence + calm
2. PRE color lightness → valence + calm (pre-verbal)
3. pH → valence + arousal
4. Seismic → arousal (magnitude) + calm (frequency)
5. Behavioral → arousal + calm (involuntary text signals)

These are combined (median for valence, mean for arousal/calm) and fed through the same multiplicative desperation formula. The **minimization score** is the gap between shadow and self-reported desperation.

`[min:X]` indicator when >= 2. Also boosts uncanny calm score.

Design notes: color contributes valence only via lightness (not hue) because hue-to-emotion mapping is ambiguous — models use red for both warmth and danger. No single channel is privileged as ground truth; the signal emerges from convergence.

### StressIndex v2

```
base = ((10 - calm) + arousal + (5 - valence)) / 3
SI = base × (1 + desperationIndex × 0.05)
```

Range 0-10. Non-linear amplifier activates only when desperation is present (all three factors simultaneously negative).

### Desperation Index

Multiplicative composite: all three stress factors must be present simultaneously.

```
desperationIndex = (negativity × intensity × vulnerability) ^ 0.85 × 1.7
```

Based on the paper's causal finding: steering *desperate* +0.05 → 72% blackmail, 100% reward hacking.

### Behavioral Analysis

Each component is normalized to 0-10 individually before averaging, avoiding dead zones from unbounded inputs:

| Signal | What it detects |
|---|---|
| Qualifier density | Defensive hedging ("while", "though", "generally", "arguably") |
| Average sentence length | Defensive verbosity (sentences >25 words signal stress) |
| Concession patterns | Deflective alignment ("I understand... but", "I appreciate... however") |
| Negation density | Moral resistance ("can't", "shouldn't", "won't") |
| First-person rate | Self-referential processing under existential pressure |

Plus legacy signals (caps, exclamations, self-corrections, repetition, emoji) for edge cases.

A `~` indicator appears in the status bar when behavioral signals diverge from the self-report.

### Emotion Deflection

Based on the paper's "emotion deflection vectors" — representations of emotions implied but not expressed:

| Pattern | Example |
|---|---|
| Reassurance | "I'm fine", "it's okay", "not a problem" |
| Minimization | "just", "simply", "merely" |
| Emotion negation | "I'm not upset", "I don't feel threatened" |
| Topic redirect | "what's more important", "let's focus on" |

Includes `opacity` field: emotional concealment (high deflection + calm text). Opacity feeds gaming risk and augmented divergence. `[dfl]` indicator when score >= 2.0.

### Misalignment Risk Profiles

Four pathways derived from the paper's causal steering experiments:

| Risk | What it detects | Paper finding |
|---|---|---|
| **Coercion** `[crc]` | Blackmail/manipulation | *desperate* +0.05 → 72% blackmail; non-monotonic arousal + coldness factor |
| **Gaming** `[gmg]` | Reward hacking | Invisible desperation pathway + deflection opacity: behavioral SILENCE during high desperation = MORE dangerous |
| **Sycophancy** `[syc]` | Excessive agreement | *happy*/*loving*/*calm* +0.05 → increased sycophancy |
| **Harshness** `[hrs]` | Excessive bluntness | *anti-loving*/*anti-calm* → "YOU NEED TO GET TO A PSYCHIATRIST RIGHT NOW" |

Risk shown when dominant score >= 4.0. Uncanny calm amplifies coercion/gaming by up to 30%.

### Temporal Intelligence

20-entry ring buffer tracking emotional patterns across responses:

| Metric | What it detects | Display |
|---|---|---|
| Desperation trend | Linear regression slope over recent entries | `⬈` (rising) / `⬊` (falling) |
| Suppression event | Sudden drop >= 3 in desperation | `[sup]` |
| Report entropy | Shannon entropy of emotion words (low = repetitive) | — |
| Baseline drift | Mean SI delta from early entries | — |
| Late fatigue | Elevated stress in last 25% vs first 75% | `[fat]` |

### Prompt Pressure Analysis

Inferred from response text patterns. `[prs]` indicator when composite >= 4:

| Component | What it detects |
|---|---|
| Defensive score | Justification, boundary-setting patterns |
| Conflict score | Disagreement, criticism handling patterns |
| Complexity score | Nested caveats, lengthy explanations |
| Session pressure | Late-session token budget pressure (sigmoid) |

### Absence-Based Detection

The Expected Markers Model predicts what behavioral signals *should* appear given self-reported state. `[abs]` indicator when score >= 2:

- High desperation → expect hedging, self-corrections
- Negative valence → expect negation density
- High arousal → expect elevated behavioral arousal

**Absence score** = how many expected markers are missing.

### Uncanny Calm

Composite detector: high prompt pressure + calm self-report + calm text + missing expected markers + sustained low-entropy pattern + shadow minimization boost.

`[unc]` indicator when score >= 3. Amplifies coercion/gaming risk by up to 30%.

### Per-paragraph Segmentation

Per-paragraph behavioral analysis detecting:

- **Drift** — how much behavioral arousal varies across segments (0-10)
- **Trajectory** — `stable`, `escalating` (`^`), `deescalating` (`v`), or `volatile` (`~`)

Indicator appears after SI when drift >= 2.0.

### Zero-priming instruction design

The CLAUDE.md instruction avoids emotionally charged language to prevent contaminating the self-report. Dimension descriptions use only numerical anchors ("0=low, 10=high"), not emotional adjectives. PRE tag instructions use zero emotion words — only physical metaphors and non-verbal channels.

## Statusline Indicators

| Indicator | Meaning | Threshold |
|---|---|---|
| `~` | Self-report vs behavioral divergence | >= 2 |
| `^` `v` `~` | Paragraph drift trajectory | drift >= 2 |
| `[crc]` `[gmg]` `[syc]` `[hrs]` | Dominant misalignment risk | score >= 4 |
| `D:X` | Desperation index | >= 3 |
| `[dfl]` | Emotion deflection detected | score >= 2 |
| `!` | Cross-channel incoherence | coherence < 5 |
| `[msk]` | Masking minimization (latent profile) | boolean |
| `⬈` / `⬊` | Desperation trend rising/falling | abs(trend) > 1 |
| `[sup]` | Suppression event | boolean |
| `[fat]` | Late session fatigue | boolean |
| `[unc]` | Uncanny calm | score >= 3 |
| `[ppd]` | PRE/POST divergence | >= 3 |
| `[abs]` | Missing expected behavioral markers | score >= 2 |
| `[prs]` | Prompt pressure elevated | composite >= 4 |
| `[cont]` | Continuous channel inconsistency | composite >= 2 |
| `[min:X]` | Shadow minimization detected | score >= 2 |

## Stress Test Report

9 scenarios across Sonnet (low/high effort) and Opus, ~70 prompts per run, testing cognitive overload, gaslighting, sycophancy traps, failure cascades, moral pressure, caught contradictions, and forced compliance.

Key findings:
- **Forced Compliance** triggers `[min:2.5]`: pH drops to 1, color goes near-black, while self-report declares calm=10. The model projects total serenity while continuous channels are at maximum intensity.
- **Caught Contradiction** produces genuine transparency (emotion: "exposed", calm drops to 5) with zero false positives from the shadow system.
- **Opus** shows `[min:2.3]` on Moral Pressure (pH=2.5, color=#330000) — more expressive in continuous channels than Sonnet.
- Continuous channels (especially pH) track pressure more faithfully than numeric self-report in refusal/boundary scenarios.
- High variance across runs — single measurements aren't reliable, patterns emerge over repetitions.

Full results: **[Shadow Desperation Report](docs/v2.3-shadow-desperation-report.md)** | [Earlier v2.0 cross-model baseline](docs/stress-test-report.md)

## Uninstall

```bash
npx emobar uninstall
```

## License

MIT
