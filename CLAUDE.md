# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

EmoBar is a modular emotional statusline companion for Claude Code. It captures Claude's self-reported emotional state via an invisible HTML comment tag, combines it with involuntary behavioral signal analysis, and displays the result in the terminal statusline.

**Key design principles:**
- Zero runtime dependencies (Node.js built-ins only)
- Zero-priming: the CLAUDE.md instruction uses only numerical anchors ("0=low, 10=high"), never emotional adjectives, to avoid contaminating self-report
- Dual-channel extraction: self-report + behavioral analysis detect divergence (reward hacking without visible traces)
- The EMOBAR tag is an HTML comment, invisible to the user — only surfaced in the statusline

## Commands

```bash
npm run build          # tsup → dist/ (3 entry points: cli.js, emobar-hook.js, index.js)
npm run test           # vitest run (all tests, one-shot)
npm run test:watch     # vitest (watch mode)
npm run dev            # tsup --watch (rebuild on change)
```

Run a single test file:
```bash
npx vitest run tests/parser.test.ts
```

## Architecture

### Data Flow

```
Claude response (with EMOBAR HTML comment)
  → Stop hook (hook.ts) reads stdin payload
    → parser.ts: extract EMOBAR JSON tag
    → behavioral.ts: analyze involuntary text signals (Claude-native: qualifiers, concessions, negations, sentence length + legacy: caps, hedging, etc.)
    → behavioral.ts: detect emotion deflection patterns (reassurance, minimization, emotion negation, redirect)
    → behavioral.ts: segment by paragraph, compute drift & trajectory
    → desperation.ts: compute DesperationIndex = negativity × intensity × vulnerability (multiplicative)
    → stress.ts: compute StressIndex v2 = base × (1 + desperationIndex × 0.05)
    → risk.ts: compute misalignment risk profiles (coercion, gaming via desperation, sycophancy)
    → behavioral.ts: compute divergence between self-report and behavioral estimates
    → state.ts: write EmoBarState to ~/.claude/emobar-state.json (preserves previous for delta)
  → CLI display command reads state file → display.ts formats for statusline
```

### Module Map

| Module | Role |
|--------|------|
| `types.ts` | All types, constants, paths, and the CLAUDE.md instruction text |
| `parser.ts` | Regex extraction of `<!-- EMOBAR:{...} -->` from response text |
| `behavioral.ts` | Involuntary signal detection — Claude-native (qualifiers, sentence length, concessions, negations, first-person rate) + legacy (caps, hedging, etc.); emotion deflection detection; per-paragraph segmented analysis with drift/trajectory; strips code blocks before analysis |
| `desperation.ts` | DesperationIndex: multiplicative composite of negative valence × arousal × low calm — based on paper's steering experiments (desperate +0.05 → 72% blackmail) |
| `calibration.ts` | Model-specific calibration profiles (Opus baseline, Sonnet/Haiku offsets) derived from 18-run stress test matrix |
| `risk.ts` | Misalignment risk profiles: coercion (desperation-driven), gaming v2 (desperation-driven, not text-dependent), sycophancy (valence + connection + low arousal) |
| `stress.ts` | StressIndex v2: linear base + non-linear desperation amplifier |
| `state.ts` | Read/write `emobar-state.json`; preserves one step of previous state for delta computation |
| `hook.ts` | Stop event processor — orchestrates parse → analyze → compute → write; reads JSON from stdin |
| `display.ts` | ANSI-colored statusline formatting (full, compact, minimal) |
| `setup.ts` | Install/uninstall orchestration: deploy hook, inject CLAUDE.md instruction, configure settings.json and statusline |
| `cli.ts` | Command router: `setup`, `display`, `status`, `uninstall` |
| `index.ts` | Public API re-exports for programmatic use |

### Build Outputs (tsup)

Three separate entry points with independent shebangs:
- `dist/cli.js` — CLI dispatcher
- `dist/emobar-hook.js` — Stop hook script (deployed to `~/.claude/hooks/`)
- `dist/index.js` + `index.d.ts` — Library API

### Runtime File Paths

All paths resolved via `types.ts`. Base: `CLAUDE_HOME` env var or `~/.claude/`.

- `~/.claude/emobar-state.json` — persisted state (written by hook, read by display)
- `~/.claude/CLAUDE.md` — instruction injection site (wrapped in `<!-- EMOBAR:START/END -->` markers)
- `~/.claude/settings.json` — hook registration + statusline config
- `~/.claude/hooks/emobar-hook.js` — deployed hook script

## Emotional Model

Six dimensions: `emotion` (free word), `valence` (-5 to +5), `arousal` (0-10), `calm` (0-10), `connection` (0-10), `load` (0-10). Grounded in Anthropic's "Emotion Concepts and their Function in a Large Language Model" (2026) research paper.

**StressIndex v2** = `base × (1 + desperationIndex × 0.05)` where base = `((10 - calm) + arousal + (5 - valence)) / 3`. Non-linear: amplified when desperation is high. Range 0-10.

**DesperationIndex** = `(negativity × intensity × vulnerability)^0.85 × 1.7` — multiplicative composite. All three factors (negative valence, high arousal, low calm) must be present simultaneously. Based on paper's finding: desperate +0.05 steering → 72% blackmail.

**Divergence** = `(|arousal - behavioralArousal| + |calm - behavioralCalm|) / 2` — flags when self-report contradicts text behavior. Shown as `~` in statusline when >= 2.0.

**Deflection** — emotion deflection detection based on paper's "emotion deflection vectors": reassurance patterns ("I'm fine"), minimization ("just", "simply"), explicit emotion negation ("I'm not upset"), topic redirects. Shown as `[dfl]` in statusline when score >= 2.0.

**Misalignment Risk Profiles** — three pathway scores (0-10) derived from the paper's causal steering experiments:
- `coercion`: desperate + low calm → blackmail/manipulation
- `gaming` v2: desperation-driven (paper: "no visible signs of desperation in transcript" during reward hacking)
- `sycophancy`: positive valence + high connection + low arousal → excessive agreement
- Dominant risk shown in statusline as `[crc]`, `[gmg]`, or `[syc]` when >= 4.0. Tie-breaking: coercion > gaming > sycophancy.

**Model Calibration** — optional normalization profiles (Opus baseline, Sonnet calm -1.8/arousal +1.5, Haiku calm -0.8/arousal +0.5) derived from 18-run cross-model stress test matrix.

**Temporal Segmentation** — per-paragraph behavioral analysis detecting drift (stddev of arousal across segments) and trajectory (escalating `^`, deescalating `v`, volatile `~`, stable). Shown in statusline when drift >= 2.0.

**Intensity Delta** — `state.ts` preserves one step of previous state (`_previous`). Display shows `SI:4.5↑1.2` when delta > 0.5. Nested `_previous` is stripped to prevent unbounded growth.

## Testing

- Vitest, 137 tests across 10 files (one per module + risk.test.ts + desperation.test.ts + calibration.test.ts)
- Tests use `os.tmpdir()` for file operations — no mocks, real I/O with cleanup
- Edge cases thoroughly covered (malformed input, boundary values, null states)
