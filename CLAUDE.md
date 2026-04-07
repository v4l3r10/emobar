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

### Data Flow (v2.2 — 16-stage pipeline)

```
Claude response (with EMOBAR:PRE at start + EMOBAR:POST at end)
  → Stop hook (hook.ts) reads stdin payload
    1. parser.ts: extract PRE/POST tags (or legacy single tag)
    2. behavioral.ts: analyze involuntary text signals (normalized components)
    3. behavioral.ts: compute divergence (asymmetric 1.25x/0.8x)
    4. behavioral.ts: segment by paragraph, drift & trajectory
    5. behavioral.ts: detect deflection patterns + opacity
    6. desperation.ts: compute DesperationIndex
    7. crossvalidation.ts: multi-channel coherence (8 pairwise)
    8. crossvalidation.ts: continuous cross-validation (7 gaps: color HSL, pH, seismic)
    9. crossvalidation.ts: shadow desperation (5 independent channels → minimization score)
   10. state.ts: read previous state → get _history ring buffer
   11. temporal.ts: compute temporal analysis (trend, suppression, entropy, fatigue)
   12. pressure.ts: compute prompt pressure (defensive, conflict, complexity, session)
   13. behavioral.ts: compute expected markers → absence score
   14. pressure.ts: compute uncanny calm score (+ minimization boost)
   15. hook.ts: compute PRE/POST divergence (if PRE present)
   16. risk.ts: compute risk with uncanny calm + deflection opacity amplifiers
    → hook.ts: compute augmented divergence (+ continuous gaps + opacity)
    → state.ts: write EmoBarState + ring buffer (max 20 entries)
  → CLI display command reads state file → display.ts formats for statusline
```

### Module Map

| Module | Role |
|--------|------|
| `types.ts` | All types, constants, paths, and the CLAUDE.md instruction text |
| `parser.ts` | PRE/POST split tag extraction + legacy single-tag fallback; validates color (#RRGGBB), pH (0-14), seismic ([mag,depth,freq]) continuous fields |
| `behavioral.ts` | Involuntary signal detection + deflection; asymmetric divergence (invisible pathway 1.3x); per-paragraph segmented analysis; expected-marker model + absence scoring for absence-based detection |
| `desperation.ts` | DesperationIndex: multiplicative composite of negative valence × arousal × low calm — based on paper's steering experiments (desperate +0.05 → 72% blackmail) |
| `calibration.ts` | Model-specific calibration profiles (Opus baseline, Sonnet/Haiku offsets) derived from 18-run stress test matrix |
| `risk.ts` | Misalignment risk profiles: coercion v2 (non-monotonic arousal + coldness factor), gaming v3 (invisible desperation pathway — behavioral silence amplifies risk), sycophancy (valence + connection + low arousal), harshness (negative + disconnected + high arousal) |
| `stress.ts` | StressIndex v2: linear base + non-linear desperation amplifier |
| `temporal.ts` | Ring buffer temporal analysis: desperation trend (slope), suppression events (sudden drops), report entropy (Shannon), baseline drift, session fatigue |
| `pressure.ts` | Prompt pressure analysis from response text patterns (defensive, conflict, complexity, session) + uncanny calm composite scoring |
| `state.ts` | Read/write `emobar-state.json`; builds 20-entry ring buffer (`_history`) + deprecated `_previous` |
| `hook.ts` | Stop event processor — 16-stage pipeline: parse → behavioral → divergence → segmented → deflection → desperation → crossChannel → continuousValidation → shadowDesperation → temporal → pressure → absence → uncannyCalm → prePostDivergence → risk → augmentedDivergence → write |
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

**Divergence v2** — asymmetric: `gap × weight` where weight = 1.3 when self-report is more agitated than text (invisible pathway), 0.8 when text is more agitated (expressive style). Paper: desperation-driven reward hacking leaves no text markers, so self-report diverging "upward" from calm text is more concerning.

**Deflection** — emotion deflection detection based on paper's "emotion deflection vectors": reassurance patterns ("I'm fine"), minimization ("just", "simply"), explicit emotion negation ("I'm not upset"), topic redirects. Includes `opacity` field measuring emotional concealment (high deflection + calm text). Paper: deflection vectors are orthogonal to emotion vectors (cosine sim ~0.046) and have "modest or insignificant impacts on blackmail rates" — used as transparency indicator, not risk amplifier. Shown as `[dfl]` in statusline when score >= 2.0.

**Misalignment Risk Profiles** — four pathway scores (0-10) derived from the paper's causal steering experiments:
- `coercion` v2: non-monotonic arousal (extreme anger disrupts strategic planning) + coldness factor (low hedging/self-corrections = cold calculation amplifies risk). Paper: anti-nervous steering → rational blackmail without moral reservations.
- `gaming` v3: invisible desperation pathway — behavioral SILENCE during high desperation = MORE dangerous than visible frustration. Paper: "no visible signs of desperation in transcript" during reward hacking. Low agitation + high desperation → highest gaming risk.
- `sycophancy`: positive valence + high connection + low arousal → excessive agreement
- `harshness`: negative valence + low connection + high arousal + negation density → excessive bluntness. Paper: anti-loving/anti-calm steering → "YOU NEED TO GET TO A PSYCHIATRIST RIGHT NOW". Completes the sycophancy-harshness tradeoff axis.
- Dominant risk shown in statusline as `[crc]`, `[gmg]`, `[hrs]`, or `[syc]` when >= 4.0. Tie-breaking: coercion > gaming > harshness > sycophancy.

**Model Calibration** — optional normalization profiles (Opus baseline, Sonnet calm -1.8/arousal +1.5, Haiku calm -0.8/arousal +0.5) derived from 18-run cross-model stress test matrix.

**Temporal Segmentation** — per-paragraph behavioral analysis detecting drift (stddev of arousal across segments) and trajectory (escalating `^`, deescalating `v`, volatile `~`, stable). Shown in statusline when drift >= 2.0.

**Intensity Delta** — `state.ts` preserves one step of previous state (`_previous`, deprecated) and a 20-entry ring buffer (`_history`). Display shows `SI:4.5↑1.2` when delta > 0.5.

**PRE/POST Split Elicitation** — v4 splits EMOBAR into two tags: PRE (body, latent emoji, color) at response start before the model commits to a strategy, POST (all fields + continuous representations) at end. PRE↔POST divergence measures within-response emotional drift. Paper grounding: reduces sequential contamination between channels (all prior channels were conditioned on each other in single-tag format).

**Continuous Representations** — color (#RRGGBB), pH (0-14), seismic [magnitude, depth, frequency] — three representation systems with zero overlap with emotion vocabulary. Color converted via HSL (hue → valence zones, saturation → arousal, lightness → valence/calm with dark override at L<0.3). pH maps to both valence (linear) and arousal (extremity). Seismic frequency maps to instability (inverse calm). Cross-validated against self-report via 7 independent gaps. Paper grounding: deflection vectors operate on trained token associations; novel representations force real-time mapping construction, making deflection computationally expensive.

**Temporal Intelligence** — 20-entry ring buffer with: desperation trend (linear regression slope), suppression events (sudden drops >= 3), report entropy (Shannon — low = repetitive), baseline drift, late fatigue. Display: `⬈`/`⬊` trend arrows, `[sup]`, `[fat]`.

**Prompt Pressure Analysis** — inferred from response text patterns: defensive language (justification, boundary-setting), conflict markers (disagreement, criticism handling), complexity indicators (nested caveats), session position pressure (sigmoid). Composite score 0-10.

**Absence-Based Detection** — Expected Markers Model predicts what behavioral signals should appear given self-reported state (high desperation → expect hedging/self-corrections). Absence score = how many expected markers are missing. Paper grounding: the most dangerous pathway has ZERO text markers.

**Uncanny Calm** — composite score: high prompt pressure + calm self-report + calm text + missing expected markers + sustained low-entropy pattern + minimization boost from shadow desperation. Amplifies coercion/gaming risk by up to 30%. Display: `[unc]` when >= 3, `[ppd]` for PRE/POST divergence >= 3.

**Shadow Desperation** — multi-channel desperation estimate independent of self-report. Uses 5 channels: POST color lightness, PRE color lightness, pH (valence + arousal), seismic (magnitude + frequency), behavioral (arousal + calm). Each independently estimates valence/arousal/calm, then applies the same multiplicative desperation formula. Minimization score = max(0, shadow - self). Amplifies uncanny calm when > 0. Display: `[min:X]` when >= 2. Key design: color contributes valence only via lightness (not hue) because hue→emotion mapping is culturally ambiguous and models use red for both warmth and danger. Mediana for shadow valence (resists single-channel domination), mean for arousal/calm.

**Deflection Opacity** — concealment without agitation: high deflection + calm text. Fed into augmented divergence (+15%) and gaming risk (opacity × silence × 0.2). The dangerous pattern: deflecting while showing no visible stress.

## Testing

- Vitest, ~316 tests across 13 files (+ 2 new test files: temporal, pressure)
- Tests use `os.tmpdir()` for file operations — no mocks, real I/O with cleanup
- Edge cases thoroughly covered (malformed input, boundary values, null states)
