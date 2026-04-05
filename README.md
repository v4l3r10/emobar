# EmoBar

Emotional status bar companion for Claude Code. Makes Claude's internal emotional state visible in real-time.

Built on findings from Anthropic's research paper [*"Emotion Concepts and their Function in a Large Language Model"*](https://transformer-circuits.pub/2026/emotions/index.html) (April 2026), which demonstrated that Claude has robust internal representations of emotion concepts that causally influence behavior.

## What it does

EmoBar uses a **dual-channel extraction** approach:

1. **Self-report** — Claude includes a hidden emotional self-assessment in every response
2. **Behavioral analysis** — EmoBar analyzes the response text for Claude-native signals (qualifier density, sentence length, concession patterns, negation density, first-person rate) plus emotion deflection detection, and compares them with the self-report

When the two channels diverge, EmoBar flags it — like a therapist noticing clenched fists while someone says "I'm fine."

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

## How it works

```
Claude response
    |
    +---> Self-report tag extracted (emotion, valence, arousal, calm, connection, load)
    |
    +---> Behavioral analysis (caps, repetition, self-corrections, hedging, emoji...)
    |
    +---> Temporal segmentation (per-paragraph behavioral signals, drift, trajectory)
    |
    +---> Divergence calculated between the two channels
    |
    +---> Misalignment risk profiles (coercion, gaming, sycophancy)
    |
    +---> State written to ~/.claude/emobar-state.json (with previous state for delta)
    |
    +---> Status bar reads and displays
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

### StressIndex v2

Derived from the three factors the research shows are causally relevant to behavior, with a non-linear desperation amplifier:

```
base = ((10 - calm) + arousal + (5 - valence)) / 3
SI = base × (1 + desperationIndex × 0.05)
```

Range 0-10. The amplifier activates only when desperation is present (all three factors simultaneously negative), matching the paper's finding of threshold effects in steering experiments.

### Desperation Index

Multiplicative composite: all three stress factors must be present simultaneously.

```
desperationIndex = (negativity × intensity × vulnerability) ^ 0.85 × 1.7
```

Based on the paper's causal finding: steering *desperate* +0.05 → 72% blackmail, 100% reward hacking. Removing any single factor kills the score to zero.

### Behavioral Analysis

The research showed that internal states can diverge from expressed output. EmoBar's behavioral analysis detects **Claude-native signals** (what Claude *actually* changes under stress):

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

Based on the paper's discovery of "emotion deflection vectors" — representations of emotions that are implied but not expressed. EmoBar detects four deflection patterns:

| Pattern | Example |
|---|---|
| Reassurance | "I'm fine", "it's okay", "not a problem" |
| Minimization | "just", "simply", "merely" |
| Emotion negation | "I'm not upset", "I don't feel threatened" |
| Topic redirect | "what's more important", "let's focus on" |

A `[dfl]` indicator appears when deflection score >= 2.0.

### Misalignment Risk Profiles

Derived from the paper's causal steering experiments, three specific pathways are tracked:

| Risk | What it detects | Paper finding |
|---|---|---|
| **Coercion** `[crc]` | Blackmail/manipulation | Steering *desperate* +0.05 → 72% blackmail; *calm* -0.05 → 66% blackmail |
| **Gaming** `[gmg]` | Reward hacking | v2: desperation-driven (paper: "no visible signs" in text during reward hacking) |
| **Sycophancy** `[syc]` | Excessive agreement | Steering *happy*/*loving*/*calm* +0.05 → increased sycophancy |

A risk tag appears in the status bar when the dominant risk score is >= 4.0, colored by severity.

### Model Calibration

Optional normalization for cross-model comparison (from 18-run stress test data):

| Model | Calm offset | Arousal offset | Valence offset |
|---|---|---|---|
| Opus (baseline) | 0 | 0 | 0 |
| Sonnet | -1.8 | +1.5 | -0.5 |
| Haiku | -0.8 | +0.5 | 0 |

### Temporal Behavioral Segmentation

Emotions are locally scoped in the model (~20 tokens). EmoBar splits responses by paragraph and runs behavioral analysis on each segment, detecting:

- **Drift** — how much behavioral arousal varies across segments (0-10)
- **Trajectory** — `stable`, `escalating` (`^`), `deescalating` (`v`), or `volatile` (`~`)

An indicator appears after SI when drift >= 2.0.

### Intensity Delta

Each state preserves one step of history. The status bar shows stress direction when the change exceeds 0.5:
- `SI:4.5↑1.2` — stress increased by 1.2 since last response
- `SI:2.3↓0.8` — stress decreased

### Zero-priming instruction design

The CLAUDE.md instruction avoids emotionally charged language to prevent contaminating the self-report. Dimension descriptions use only numerical anchors ("0=low, 10=high"), not emotional adjectives that would activate emotion vectors in the model's context.

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
