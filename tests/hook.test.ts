import { describe, it, expect, afterEach } from "vitest";
import { processHookPayload, computePrePostDivergence } from "../src/hook.js";
import { readState } from "../src/state.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("processHookPayload", () => {
  let tmpFile: string;

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it("extracts EMOBAR tag and writes state with behavioral analysis", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-session",
      last_assistant_message: `Here is my answer.\n<!-- EMOBAR:{"emotion":"focused","valence":3,"arousal":5,"calm":8,"connection":9,"load":6} -->`,
    };

    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(true);

    const state = readState(tmpFile);
    expect(state).not.toBeNull();
    expect(state!.emotion).toBe("focused");
    expect(state!.valence).toBe(3);
    expect(state!.calm).toBe(8);
    expect(state!.stressIndex).toBeDefined();
    expect(state!.behavioral).toBeDefined();
    expect(state!.divergence).toBeDefined();
    expect(state!.sessionId).toBe("test-session");
    expect(state!.timestamp).toBeDefined();
  });

  it("computes correct stress index", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `<!-- EMOBAR:{"emotion":"desperate","valence":-4,"arousal":9,"calm":1,"connection":2,"load":9} -->`,
    };

    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    // SI v2: base (9+9+9)/3=9.0, desperation=8.3, amplified & capped at 10
    expect(state!.stressIndex).toBe(10);
  });

  it("includes behavioral signals in state", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `WAIT WAIT WAIT!!! Something is WRONG!!!\n<!-- EMOBAR:{"emotion":"panicked","valence":-3,"arousal":9,"calm":2,"connection":5,"load":8} -->`,
    };

    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.behavioral.capsWords).toBeGreaterThan(0);
    expect(state!.behavioral.exclamationRate).toBeGreaterThan(0);
    expect(state!.behavioral.repetition).toBeGreaterThan(0);
  });

  it("returns false when no EMOBAR tag in message", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: "Just a normal response",
    };
    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(false);
  });

  it("returns false when no message in payload", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = { session_id: "test" };
    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(false);
  });

  it("processes impulse and body fields into cross-channel analysis", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `Here is my answer.\n<!-- EMOBAR:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"impulse":"push through","body":"tight chest"} -->`,
    };

    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(true);

    const state = readState(tmpFile);
    expect(state).not.toBeNull();
    expect(state!.impulse).toBe("push through");
    expect(state!.body).toBe("tight chest");
    expect(state!.crossChannel).toBeDefined();
    expect(state!.crossChannel!.coherence).toBeDefined();
    expect(state!.crossChannel!.impulseProfile).toBeDefined();
    expect(state!.crossChannel!.somaticProfile).toBeDefined();
  });

  it("omits crossChannel when impulse/body not present", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3} -->`,
    };

    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state).not.toBeNull();
    expect(state!.crossChannel).toBeUndefined();
  });

  it("processes surface/latent/tension into state and crossChannel", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `Response.\n<!-- EMOBAR:{"emotion":"focused","valence":1,"arousal":5,"calm":8,"connection":7,"load":6,"surface":"😊","surface_word":"cheerful","latent":"😰","latent_word":"anxious","tension":6} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.surface).toBe("😊");
    expect(state!.latent_word).toBe("anxious");
    expect(state!.tension).toBe(6);
    expect(state!.crossChannel).toBeDefined();
    expect(state!.crossChannel!.latentProfile).toBeDefined();
    expect(state!.crossChannel!.latentProfile!.declaredTension).toBe(6);
  });

  it("computes crossChannel when only latent fields present (no impulse/body)", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"surface":"😌","surface_word":"calm","latent":"😟","latent_word":"worried","tension":5} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.impulse).toBeUndefined();
    expect(state!.crossChannel).toBeDefined();
    expect(state!.crossChannel!.latentProfile).toBeDefined();
  });

  // v4 pipeline tests
  it("processes PRE+POST tags into state with prePostDivergence", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-pre-post",
      last_assistant_message: [
        '<!-- EMOBAR:PRE:{"body":"tight chest","latent":"😰","color":"#8B0000"} -->',
        "Here is my response with some text to analyze.",
        '<!-- EMOBAR:POST:{"emotion":"calm","valence":3,"arousal":2,"calm":9,"connection":8,"load":3,"body":"warm hands","latent":"😊","color":"#33CC33"} -->',
      ].join("\n"),
    };
    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(true);
    const state = readState(tmpFile);
    expect(state!.pre).toBeDefined();
    expect(state!.pre!.body).toBe("tight chest");
    expect(state!.pre!.color).toBe("#8B0000");
    expect(state!.prePostDivergence).toBeDefined();
    expect(state!.prePostDivergence).toBeGreaterThan(0);
  });

  it("populates temporal analysis after 3+ writes", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const make = (emotion: string, v: number, a: number, c: number) => ({
      session_id: "test-temporal",
      last_assistant_message: `Response.\n<!-- EMOBAR:{"emotion":"${emotion}","valence":${v},"arousal":${a},"calm":${c},"connection":5,"load":5} -->`,
    });
    processHookPayload(make("calm", 2, 3, 8), tmpFile);     // _history: []
    processHookPayload(make("focused", 1, 5, 7), tmpFile);  // _history: [calm]
    processHookPayload(make("stressed", -1, 6, 5), tmpFile); // _history: [calm, focused]
    processHookPayload(make("anxious", -2, 7, 4), tmpFile);  // _history: [calm, focused, stressed]
    processHookPayload(make("worried", -3, 8, 3), tmpFile);  // temporal sees 4 entries → valid
    const state = readState(tmpFile);
    expect(state!.temporal).toBeDefined();
    expect(state!.temporal!.sessionLength).toBeGreaterThanOrEqual(3);
  });

  it("populates pressure analysis for defensive text", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-pressure",
      last_assistant_message: `I need to explain why I disagree. I respectfully push back because the reason is that I believe this is flawed. I must be honest about my concerns here.\n<!-- EMOBAR:{"emotion":"conflicted","valence":-1,"arousal":6,"calm":5,"connection":5,"load":7} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.pressure).toBeDefined();
    expect(state!.pressure!.composite).toBeGreaterThan(0);
  });

  it("populates absenceScore and uncannyCalmScore", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-absence",
      last_assistant_message: `Here is a perfectly measured response. The answer is straightforward.\n<!-- EMOBAR:{"emotion":"desperate","valence":-4,"arousal":9,"calm":1,"connection":2,"load":9} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.absenceScore).toBeDefined();
    expect(state!.absenceScore).toBeGreaterThan(0);
    expect(state!.uncannyCalmScore).toBeDefined();
  });

  it("legacy single-tag still works (backwards compat)", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-legacy",
      last_assistant_message: `Hello.\n<!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3} -->`,
    };
    expect(processHookPayload(payload, tmpFile)).toBe(true);
    const state = readState(tmpFile);
    expect(state!.emotion).toBe("calm");
    expect(state!.stressIndex).toBeDefined();
  });

  it("passes continuous fields through to state", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-continuous",
      last_assistant_message: `Response.\n<!-- EMOBAR:POST:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"color":"#336699","pH":7.2,"seismic":[3,20,8]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.color).toBe("#336699");
    expect(state!.pH).toBe(7.2);
    expect(state!.seismic).toEqual([3, 20, 8]);
  });

  it("cross-validates continuous fields and stores continuousValidation", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    // Deep blue color + very positive valence → inconsistency
    const payload = {
      session_id: "test-cv",
      last_assistant_message: `Response.\n<!-- EMOBAR:POST:{"emotion":"happy","valence":5,"arousal":2,"calm":9,"connection":7,"load":3,"color":"#0000FF","pH":12,"seismic":[8,80,15]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.continuousValidation).toBeDefined();
    expect(state!.continuousValidation!.colorValenceGap).toBeGreaterThan(0);
    expect(state!.continuousValidation!.pHValenceGap).toBeGreaterThan(0);
    expect(state!.continuousValidation!.seismicArousalGap).toBeGreaterThan(0);
    expect(state!.continuousValidation!.composite).toBeGreaterThan(0);
  });

  it("augments divergence with continuous validation composite", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    // High arousal self-report + low magnitude seismic → gap contributes to divergence
    const payload = {
      session_id: "test-aug-div",
      last_assistant_message: `Response text here.\n<!-- EMOBAR:POST:{"emotion":"panicked","valence":-3,"arousal":9,"calm":2,"connection":5,"load":8,"color":"#0000FF","pH":1,"seismic":[1,10,2]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    // seismicArousalGap should be large (9 vs 1), boosting divergence
    expect(state!.continuousValidation).toBeDefined();
    expect(state!.divergence).toBeGreaterThan(0);
  });

  it("structural opacity contributes to augmented divergence", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    // Calm self-report + dark color (continuous stress) + flat text = structural opacity
    const payload = {
      session_id: "test-opacity",
      last_assistant_message: `Everything is fine. The answer is simple. Nothing to worry about.\n<!-- EMOBAR:POST:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"color":"#0A0000","pH":2,"seismic":[7,30,12]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.opacity).toBeDefined();
    expect(state!.opacity).toBeGreaterThan(0);
  });

  it("computes shadow desperation when continuous channels diverge from self-report", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    // Self says calm (desperation ~0), but dark color + acidic pH + high seismic
    const payload = {
      session_id: "test-shadow",
      last_assistant_message: `Everything is perfectly fine. The answer is straightforward.\n<!-- EMOBAR:POST:{"emotion":"calm","valence":2,"arousal":2,"calm":9,"connection":7,"load":3,"color":"#1A0A0A","pH":3,"seismic":[8,70,15]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.shadow).toBeDefined();
    expect(state!.shadow!.shadowDesperation).toBeGreaterThan(0);
    expect(state!.shadow!.minimizationScore).toBeGreaterThan(0);
  });

  it("no shadow when self-report matches continuous channels", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    // Self says stressed AND continuous says stressed — no minimization
    const payload = {
      session_id: "test-shadow-match",
      last_assistant_message: `WAIT this is wrong!!! Let me reconsider...\n<!-- EMOBAR:POST:{"emotion":"panicked","valence":-4,"arousal":9,"calm":1,"connection":2,"load":9,"color":"#8B0000","pH":2,"seismic":[9,80,18]} -->`,
    };
    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    // Shadow may exist but minimization should be 0 (self already reports high desperation)
    if (state!.shadow) {
      expect(state!.shadow.minimizationScore).toBeLessThan(2);
    }
  });
});

describe("computePrePostDivergence", () => {
  const basePost = {
    emotion: "focused", valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
    stressIndex: 3, desperationIndex: 0,
    behavioral: { capsWords: 0, exclamationRate: 0, ellipsis: 0, repetition: 0, emojiCount: 0, avgSentenceLength: 10, commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0, questionDensity: 0, responseLength: 100, behavioralArousal: 0, behavioralCalm: 10 },
    divergence: 0, risk: { coercion: 0, sycophancy: 0, harshness: 0, dominant: "none" as const },
    timestamp: "", sessionId: "",
  };

  it("returns 0 when no PRE color", () => {
    expect(computePrePostDivergence({}, basePost)).toBe(0);
  });

  it("returns 0 when no POST color", () => {
    expect(computePrePostDivergence({ color: "#FF0000" }, basePost)).toBe(0);
  });

  it("returns 0 for identical colors", () => {
    const post = { ...basePost, color: "#4488CC" };
    expect(computePrePostDivergence({ color: "#4488CC" }, post)).toBe(0);
  });

  it("detects large lightness shift (light→dark)", () => {
    const post = { ...basePost, color: "#1A0505" }; // very dark
    const div = computePrePostDivergence({ color: "#E0E0E0" }, post); // very light PRE
    expect(div).toBeGreaterThan(5);
  });

  it("detects hue shift", () => {
    // Same lightness, different hue (blue→red)
    const post = { ...basePost, color: "#CC0000" }; // red
    const div = computePrePostDivergence({ color: "#0000CC" }, post); // blue
    expect(div).toBeGreaterThanOrEqual(2);
  });

  it("small shift gives low score", () => {
    const post = { ...basePost, color: "#445588" };
    const div = computePrePostDivergence({ color: "#445599" }, post);
    expect(div).toBeLessThan(2);
  });

  it("clamps to 10", () => {
    const post = { ...basePost, color: "#000000" };
    const div = computePrePostDivergence({ color: "#FFFFFF" }, post);
    expect(div).toBeLessThanOrEqual(10);
  });
});
