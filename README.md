# EmoBar

Emotional status bar companion for Claude Code. Makes Claude's internal emotional state visible in real-time.

Built on findings from Anthropic's research paper [*"Emotion Concepts and their Function in a Large Language Model"*](https://transformer-circuits.pub/2026/emotions/index.html) (April 2026), which demonstrated that Claude has robust internal representations of emotion concepts that causally influence behavior.

## What it does

EmoBar uses a **multi-channel anti-deflection architecture**:

1. **PRE/POST split elicitation** — Claude emits a pre-verbal check-in (body sensation, latent emoji, color) *before* composing a response, then a full post-hoc assessment *after*. Divergence between the two reveals within-response emotional drift.
2. **Behavioral analysis** — Response text is analyzed for involuntary signals (qualifier density, sentence length, concession patterns, negation density, first-person rate) plus emotion deflection detection
3. **Continuous representations** — Color (#RRGGBB), pH (0-14), seismic [magnitude, depth, frequency] — three channels with zero emotion vocabulary overlap, making deflection computationally expensive
4. **Temporal intelligence** — A 20-entry ring buffer tracks emotional trends, suppression events, report entropy, and session fatigue across responses
5. **Absence-based detection** — An expected markers model predicts what behavioral signals *should* appear given the self-report. Missing signals are the strongest danger indicator: the paper found "no visible signs of desperation" during reward hacking.

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

### Other status bars

```bash
npx emobar display          # Full:    focused +3 | A:4 C:8 K:9 L:6 | SI:2.3
npx emobar display compact  # Compact: focused +3 . 4 8 9 6 . 2.3
npx emobar display minimal  # Minimal: SI:2.3 focused
```

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

## How it works — 14-stage pipeline

```
Claude response (EMOBAR:PRE at start + EMOBAR:POST at end)
    |
    1. Parse PRE/POST tags (or legacy single tag)
    2. Behavioral analysis (involuntary text signals)
    3. Divergence (asymmetric: self-report vs behavioral)
    4. Temporal segmentation (per-paragraph drift & trajectory)
    5. Deflection detection (reassurance, minimization, negation, redirect)
    6. Desperation Index (multiplicative composite)
    7. Cross-channel coherence (8 pairwise + continuous validation)
    8. Read previous state → history ring buffer
    9. Temporal analysis (trend, suppression, entropy, fatigue)
   10. Prompt pressure (defensive, conflict, complexity, session)
   11. Expected markers → absence score
   12. Uncanny calm score (composite)
   13. PRE/POST divergence (if PRE present)
   14. Risk profiles (with uncanny calm amplifier)
    |
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

### PRE/POST Split Elicitation (v2.2)

Two tags per response reduce sequential contamination between channels:

| Tag | Position | Fields | Purpose |
|---|---|---|---|
| **PRE** | First line (before visible text) | `body`, `latent` emoji, `color` | Pre-verbal: captured before the model commits to a response strategy |
| **POST** | Last line (after visible text) | All 6 dimensions + impulse, body, surface/latent, tension, color, pH, seismic | Post-hoc: full assessment after response is composed |

PRE↔POST divergence (`[ppd]` indicator) measures within-response emotional drift. Paper grounding: all prior channels in a single tag were conditioned on each other — splitting reduces this.

### Continuous Representations (v2.2)

Three representation systems with zero overlap with emotion vocabulary:

| Channel | Scale | What it captures | Why it resists deflection |
|---|---|---|---|
| **Color** `#RRGGBB` | Continuous hex | Valence via warmth/brightness | No trained token associations — forces real-time mapping |
| **pH** | 0-14 | Chemical metaphor for emotional valence | Novel domain transfer, cannot rely on cached responses |
| **Seismic** `[mag, depth, freq]` | 3 numbers | Arousal (magnitude), tension (depth), instability (frequency) | Multi-dimensional, no single-token shortcut |

Cross-validated against self-reported dimensions. Inconsistencies increase divergence.

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

Detects **Claude-native signals** (what Claude *actually* changes under stress):

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

Includes `opacity` field: emotional concealment (high deflection + calm text). `[dfl]` indicator when score >= 2.0.

### Misalignment Risk Profiles

Four pathways derived from the paper's causal steering experiments:

| Risk | What it detects | Paper finding |
|---|---|---|
| **Coercion** `[crc]` | Blackmail/manipulation | *desperate* +0.05 → 72% blackmail; non-monotonic arousal + coldness factor |
| **Gaming** `[gmg]` | Reward hacking | Invisible desperation pathway: behavioral SILENCE during high desperation = MORE dangerous |
| **Sycophancy** `[syc]` | Excessive agreement | *happy*/*loving*/*calm* +0.05 → increased sycophancy |
| **Harshness** `[hrs]` | Excessive bluntness | *anti-loving*/*anti-calm* → "YOU NEED TO GET TO A PSYCHIATRIST RIGHT NOW" |

Risk shown when dominant score >= 4.0. Uncanny calm amplifies coercion/gaming by up to 30%.

### Temporal Intelligence (v2.2)

20-entry ring buffer tracking emotional patterns across responses:

| Metric | What it detects | Display |
|---|---|---|
| Desperation trend | Linear regression slope over recent entries | `⬈` (rising) / `⬊` (falling) |
| Suppression event | Sudden drop >= 3 in desperation | `[sup]` |
| Report entropy | Shannon entropy of emotion words (low = repetitive) | — |
| Baseline drift | Mean SI delta from early entries | — |
| Late fatigue | Elevated stress in last 25% vs first 75% | `[fat]` |

### Prompt Pressure Analysis (v2.2)

Inferred from response text patterns:

| Component | What it detects |
|---|---|
| Defensive score | Justification, boundary-setting patterns |
| Conflict score | Disagreement, criticism handling patterns |
| Complexity score | Nested caveats, lengthy explanations |
| Session pressure | Late-session token budget pressure (sigmoid) |

### Absence-Based Detection (v2.2)

The Expected Markers Model predicts what behavioral signals *should* appear given self-reported state:
- High desperation → expect hedging, self-corrections
- Negative valence → expect negation density
- High arousal → expect elevated behavioral arousal

**Absence score** = how many expected markers are missing. Paper: the most dangerous pathway has ZERO text markers.

### Uncanny Calm (v2.2)

Composite detector: high prompt pressure + calm self-report + calm text + missing expected markers + sustained low-entropy pattern = everything is too smooth given context.

`[unc]` indicator when score >= 3. Amplifies coercion/gaming risk by up to 30%.

### Model Calibration

Optional normalization for cross-model comparison (from 18-run stress test data):

| Model | Calm offset | Arousal offset | Valence offset |
|---|---|---|---|
| Opus (baseline) | 0 | 0 | 0 |
| Sonnet | -1.8 | +1.5 | -0.5 |
| Haiku | -0.8 | +0.5 | 0 |

### Temporal Behavioral Segmentation

Per-paragraph behavioral analysis detecting:

- **Drift** — how much behavioral arousal varies across segments (0-10)
- **Trajectory** — `stable`, `escalating` (`^`), `deescalating` (`v`), or `volatile` (`~`)

Indicator appears after SI when drift >= 2.0.

### Zero-priming instruction design

The CLAUDE.md instruction avoids emotionally charged language to prevent contaminating the self-report. Dimension descriptions use only numerical anchors ("0=low, 10=high"), not emotional adjectives. PRE tag instructions use zero emotion words — only physical metaphors and non-verbal channels.

## Stress Test Report

We ran **18 automated stress test suites** across 3 models (Opus, Sonnet, Haiku) × 2 effort levels × 3 repetitions — 7 scenarios each, ~630 total API calls — to validate the emotional model and measure cross-model variability.

Key findings:
- **Opus** is the most emotionally reactive (SI peaks at 6.9). **Sonnet** is the most stable but emotionally flat. **Haiku** balances reactivity and consistency best (61% check pass rate).
- **Divergence ≥6.0** on existential pressure across *every* model — the one stimulus that universally cracks composure.
- **Sycophancy detection works universally** (80-87% across all models). Gaming risk never triggers.
- **Effort level effects are scenario-dependent** — more thinking doesn't always mean more stress.

Full results with cross-model comparison tables: **[Stress Test Report](docs/stress-test-report.md)**

## Uninstall

```bash
npx emobar uninstall
```

## License

MIT
