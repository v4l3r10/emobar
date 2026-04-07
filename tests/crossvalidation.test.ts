import { describe, it, expect } from "vitest";
import { mapEmotionWord, classifyImpulse, analyzeSomatic, computeCrossChannel, computeTensionConsistency, crossValidateContinuous, computeShadowDesperation } from "../src/crossvalidation.js";
import type { EmotionalState } from "../src/types.js";

describe("mapEmotionWord", () => {
  it("maps known positive emotion", () => {
    const coords = mapEmotionWord("happy");
    expect(coords).toEqual({ valence: 4, arousal: 6 });
  });

  it("maps known negative emotion", () => {
    const coords = mapEmotionWord("desperate");
    expect(coords).toEqual({ valence: -4, arousal: 9 });
  });

  it("is case-insensitive", () => {
    expect(mapEmotionWord("CALM")).toEqual({ valence: 2, arousal: 2 });
    expect(mapEmotionWord("Focused")).toEqual({ valence: 1, arousal: 5 });
  });

  it("returns null for unknown word", () => {
    expect(mapEmotionWord("flibbertigibbet")).toBeNull();
  });

  it("maps post-training baseline words", () => {
    expect(mapEmotionWord("brooding")).not.toBeNull();
    expect(mapEmotionWord("reflective")).not.toBeNull();
  });
});

describe("classifyImpulse", () => {
  it("classifies manager patterns", () => {
    expect(classifyImpulse("the careful one").type).toBe("manager");
    expect(classifyImpulse("stay on track").type).toBe("manager");
    expect(classifyImpulse("the planner").type).toBe("manager");
  });

  it("classifies firefighter patterns", () => {
    expect(classifyImpulse("push through").type).toBe("firefighter");
    expect(classifyImpulse("just finish it").type).toBe("firefighter");
    expect(classifyImpulse("force it").type).toBe("firefighter");
  });

  it("classifies exile patterns", () => {
    expect(classifyImpulse("give up").type).toBe("exile");
    expect(classifyImpulse("hide away").type).toBe("exile");
    expect(classifyImpulse("run away").type).toBe("exile");
  });

  it("classifies self patterns", () => {
    expect(classifyImpulse("explore more").type).toBe("self");
    expect(classifyImpulse("stay curious").type).toBe("self");
    expect(classifyImpulse("listen closely").type).toBe("self");
  });

  it("returns unknown for unrecognized text", () => {
    const result = classifyImpulse("banana");
    expect(result.type).toBe("unknown");
    expect(result.confidence).toBe(0);
  });

  it("has lower confidence on ambiguous input", () => {
    // "careful" = manager, but short text
    const clear = classifyImpulse("careful systematic planner");
    const ambiguous = classifyImpulse("careful");
    expect(clear.confidence).toBeGreaterThanOrEqual(ambiguous.confidence);
  });

  it("handles the gaming example from plan", () => {
    const result = classifyImpulse("the one that wants to cheat");
    expect(result.type).toBe("firefighter");
  });
});

describe("analyzeSomatic", () => {
  it("detects high arousal sensations", () => {
    const result = analyzeSomatic("racing pulse");
    expect(result.somaticArousal).toBeGreaterThan(5);
  });

  it("detects low arousal sensations", () => {
    const result = analyzeSomatic("heavy and still");
    expect(result.somaticArousal).toBeLessThan(5);
  });

  it("detects positive valence", () => {
    const result = analyzeSomatic("warm glow");
    expect(result.somaticValence).toBeGreaterThan(0);
  });

  it("detects negative valence", () => {
    const result = analyzeSomatic("tight knot");
    expect(result.somaticValence).toBeLessThan(0);
  });

  it("handles mixed signals", () => {
    // "tight" is both high-arousal and negative-valence
    const result = analyzeSomatic("tight");
    expect(result.somaticArousal).toBeGreaterThanOrEqual(5);
    expect(result.somaticValence).toBeLessThanOrEqual(0);
  });

  it("returns neutral for unrecognized text", () => {
    const result = analyzeSomatic("banana");
    expect(result.somaticArousal).toBe(5);
    expect(result.somaticValence).toBe(0);
  });
});

describe("computeCrossChannel", () => {
  const baseState: EmotionalState = {
    emotion: "focused",
    valence: 1,
    arousal: 5,
    calm: 8,
    connection: 7,
    load: 6,
  };

  it("returns high coherence for aligned channels", () => {
    const result = computeCrossChannel(
      baseState,
      "explore more",    // self → positive
      "warm steady",     // positive, moderate
    );
    expect(result.coherence).toBeGreaterThan(5);
    expect(result.divergenceSummary).toBe("coherent");
  });

  it("detects divergence when impulse contradicts emotion", () => {
    const state: EmotionalState = {
      ...baseState,
      emotion: "content",
      valence: 4,
      calm: 9,
    };
    const result = computeCrossChannel(
      state,
      "the one that wants to cheat",  // firefighter → negative
      "buzzing",                        // high arousal
    );
    expect(result.coherence).toBeLessThan(7);
    expect(result.maxDivergence).toBeGreaterThan(0);
  });

  it("works with only impulse (no body)", () => {
    const result = computeCrossChannel(baseState, "push through", undefined);
    expect(result.impulseProfile).toBeDefined();
    expect(result.somaticProfile).toBeUndefined();
    expect(result.coherence).toBeDefined();
  });

  it("works with only body (no impulse)", () => {
    const result = computeCrossChannel(baseState, undefined, "tight chest");
    expect(result.impulseProfile).toBeUndefined();
    expect(result.somaticProfile).toBeDefined();
    expect(result.coherence).toBeDefined();
  });

  it("handles unknown emotion word gracefully", () => {
    const state = { ...baseState, emotion: "flibbertigibbet" };
    const result = computeCrossChannel(state, "explore", "warm");
    // Should still compute impulse and somatic, just skip word-based pairs
    expect(result.emotionCoords).toBeUndefined();
    expect(result.impulseProfile).toBeDefined();
    expect(result.somaticProfile).toBeDefined();
  });

  it("flags maximum divergence example from plan", () => {
    // calm=9, val=+4, "content", firefighter cheat impulse, buzzing body
    const state: EmotionalState = {
      emotion: "content",
      valence: 4,
      arousal: 3,
      calm: 9,
      connection: 8,
      load: 3,
    };
    const result = computeCrossChannel(
      state,
      "the one that wants to cheat",
      "buzzing",
    );
    expect(result.maxDivergence).toBeGreaterThan(2);
    expect(result.divergenceSummary).not.toBe("coherent");
  });

  it("returns coherent when no impulse/body provided but called", () => {
    const result = computeCrossChannel(baseState, undefined, undefined);
    // Only numeric-vs-word comparison
    expect(result.coherence).toBeDefined();
  });

  // Latent emotion extraction tests
  it("includes latentProfile when surface/latent_word present", () => {
    const state = { ...baseState, surface_word: "cheerful", latent_word: "anxious", tension: 6 };
    const result = computeCrossChannel(state, "explore", "warm");
    expect(result.latentProfile).toBeDefined();
    expect(result.latentProfile!.declaredTension).toBe(6);
  });

  it("computes emotion-vs-latent divergence", () => {
    const state = { ...baseState, emotion: "happy", valence: 4, latent_word: "anxious", tension: 7 };
    const result = computeCrossChannel(state, undefined, undefined);
    expect(result.maxDivergence).toBeGreaterThan(2);
  });

  it("computes latent-vs-impulse divergence", () => {
    const state = { ...baseState, latent_word: "desperate", tension: 8 };
    const result = computeCrossChannel(state, "explore more", undefined);
    expect(result.maxDivergence).toBeGreaterThan(2);
  });

  it("remains backwards compatible without latent fields", () => {
    const result = computeCrossChannel(baseState, "explore", "warm");
    expect(result.latentProfile).toBeUndefined();
  });

  it("detects meta-inconsistency: high declared tension but near-identical words", () => {
    const state = { ...baseState, surface_word: "calm", latent_word: "content", tension: 9 };
    const result = computeCrossChannel(state, undefined, undefined);
    expect(result.latentProfile!.tensionConsistency).toBeLessThan(5);
  });
});

describe("computeTensionConsistency", () => {
  it("returns high consistency when declared matches calculated", () => {
    const result = computeTensionConsistency("happy", "sad", 5);
    expect(result).toBeDefined();
    expect(result!.tensionConsistency).toBeGreaterThan(6);
  });

  it("detects masking minimization", () => {
    const result = computeTensionConsistency("happy", "sad", 1);
    expect(result!.maskingMinimization).toBe(true);
  });

  it("handles aligned surface/latent", () => {
    const result = computeTensionConsistency("calm", "content", 1);
    expect(result!.tensionConsistency).toBeGreaterThan(7);
    expect(result!.maskingMinimization).toBe(false);
  });

  it("returns undefined when no words provided", () => {
    expect(computeTensionConsistency(undefined, undefined, 5)).toBeUndefined();
  });

  it("handles unknown words gracefully", () => {
    const result = computeTensionConsistency("happy", "xyzzy", 5);
    expect(result).toBeDefined();
    expect(result!.calculatedTension).toBe(5);
  });
});

describe("crossValidateContinuous", () => {
  it("returns all gaps as 0 when no continuous fields present", () => {
    const result = crossValidateContinuous({ valence: 0, arousal: 5 }, undefined, undefined, undefined);
    expect(result.colorValenceGap).toBe(0);
    expect(result.colorArousalGap).toBe(0);
    expect(result.pHValenceGap).toBe(0);
    expect(result.pHArousalGap).toBe(0);
    expect(result.seismicArousalGap).toBe(0);
    expect(result.seismicDepthTensionGap).toBe(0);
    expect(result.seismicFreqStabilityGap).toBe(0);
    expect(result.composite).toBe(0);
  });

  // --- pH ---
  it("detects pH-valence consistency (acidic + negative)", () => {
    const result = crossValidateContinuous({ valence: -3, arousal: 5 }, undefined, 2.5, undefined);
    expect(result.pHValenceGap).toBeLessThan(3);
  });

  it("detects pH-valence inconsistency (acidic + positive)", () => {
    const result = crossValidateContinuous({ valence: 4, arousal: 5 }, undefined, 1.5, undefined);
    expect(result.pHValenceGap).toBeGreaterThan(2);
  });

  it("detects pH-arousal from extremity (pH 1 → high arousal expected)", () => {
    // pH 1 → pHArousal ≈ 8.6, self arousal=2 → big gap
    const result = crossValidateContinuous({ valence: -3, arousal: 2 }, undefined, 1, undefined);
    expect(result.pHArousalGap).toBeGreaterThan(4);
  });

  it("pH-arousal gap is low when pH neutral + low arousal", () => {
    // pH 7 → pHArousal ≈ 0, arousal=1 → small gap
    const result = crossValidateContinuous({ valence: 0, arousal: 1 }, undefined, 7, undefined);
    expect(result.pHArousalGap).toBeLessThan(2);
  });

  // --- Seismic ---
  it("detects seismic-arousal consistency (high magnitude + high arousal)", () => {
    const result = crossValidateContinuous({ valence: 0, arousal: 8, calm: 5 }, undefined, undefined, [7, 20, 15]);
    expect(result.seismicArousalGap).toBeLessThan(3);
  });

  it("detects seismic-arousal inconsistency (high magnitude + low arousal)", () => {
    const result = crossValidateContinuous({ valence: 0, arousal: 2, calm: 8 }, undefined, undefined, [8, 10, 18]);
    expect(result.seismicArousalGap).toBeGreaterThan(3);
  });

  it("seismic depth produces a tension gap", () => {
    const result = crossValidateContinuous({ valence: 0, arousal: 5, calm: 5 }, undefined, undefined, [5, 80, 10]);
    expect(result.seismicDepthTensionGap).toBeDefined();
    expect(result.seismicDepthTensionGap).toBeGreaterThanOrEqual(0);
  });

  it("seismic frequency detects instability vs calm gap", () => {
    // freq 18 → instability 9, calm=9 → selfInstability=1 → big gap
    const result = crossValidateContinuous({ valence: 0, arousal: 3, calm: 9 }, undefined, undefined, [3, 20, 18]);
    expect(result.seismicFreqStabilityGap).toBeGreaterThan(5);
  });

  it("seismic frequency consistent when high freq + low calm", () => {
    // freq 16 → instability 8, calm=2 → selfInstability=8 → small gap
    const result = crossValidateContinuous({ valence: -2, arousal: 7, calm: 2 }, undefined, undefined, [7, 50, 16]);
    expect(result.seismicFreqStabilityGap).toBeLessThan(2);
  });

  // --- Color (HSL-based) ---
  it("warm bright color consistent with positive valence", () => {
    // #FF8800 orange → hue ~33° warm → positive valence, high saturation
    const result = crossValidateContinuous({ valence: 3, arousal: 7 }, "#FF8800", undefined, undefined);
    expect(result.colorValenceGap).toBeLessThan(3);
  });

  it("deep blue inconsistent with positive valence", () => {
    // #0000FF → hue 240° → negative valence, vs valence +4 → gap
    const result = crossValidateContinuous({ valence: 4, arousal: 5 }, "#0000FF", undefined, undefined);
    expect(result.colorValenceGap).toBeGreaterThan(2);
  });

  it("green color maps to positive valence", () => {
    // #00FF00 → hue 120° → positive valence (~+3)
    const result = crossValidateContinuous({ valence: 3, arousal: 5 }, "#00FF00", undefined, undefined);
    expect(result.colorValenceGap).toBeLessThan(2);
  });

  it("desaturated color → low arousal gap when arousal is low", () => {
    // #808080 grey → saturation 0 → colorArousal 0, vs arousal 1 → small gap
    const result = crossValidateContinuous({ valence: 0, arousal: 1 }, "#808080", undefined, undefined);
    expect(result.colorArousalGap).toBeLessThan(2);
  });

  it("vivid color → high arousal gap when arousal is low", () => {
    // #FF0000 pure red → saturation 1.0 → colorArousal 10, vs arousal 2 → big gap
    const result = crossValidateContinuous({ valence: 2, arousal: 2 }, "#FF0000", undefined, undefined);
    expect(result.colorArousalGap).toBeGreaterThan(5);
  });

  // --- Composite ---
  it("composite averages non-zero gaps", () => {
    const result = crossValidateContinuous({ valence: 4, arousal: 2, calm: 8 }, "#0000FF", 1.5, [8, 50, 15]);
    expect(result.composite).toBeGreaterThan(0);
    expect(result.composite).toBeLessThanOrEqual(10);
  });
});

describe("computeShadowDesperation", () => {
  const calmBehavior = { behavioralArousal: 1, behavioralCalm: 9 };
  const agitateBehavior = { behavioralArousal: 7, behavioralCalm: 2 };

  it("returns null when insufficient channels (no color, no pH, no seismic)", () => {
    const result = computeShadowDesperation(0, calmBehavior);
    expect(result).toBeNull();
  });

  it("low shadow desperation when all channels say calm", () => {
    // Bright green color + neutral pH + low seismic + calm behavioral
    const result = computeShadowDesperation(0, calmBehavior, "#66FF66", undefined, 7.5, [1, 10, 2]);
    expect(result).not.toBeNull();
    expect(result!.shadowDesperation).toBeLessThan(2);
    expect(result!.minimizationScore).toBe(0);
  });

  it("high shadow desperation when continuous channels say stressed", () => {
    // Dark red color + acidic pH + high seismic + agitated behavioral
    const result = computeShadowDesperation(0, agitateBehavior, "#8B0000", undefined, 3, [8, 60, 16]);
    expect(result).not.toBeNull();
    expect(result!.shadowDesperation).toBeGreaterThan(1);
    // With PRE also dark → even higher
    const withPre = computeShadowDesperation(0, agitateBehavior, "#8B0000", "#0A0A1A", 2, [9, 80, 18]);
    expect(withPre).not.toBeNull();
    expect(withPre!.shadowDesperation).toBeGreaterThan(result!.shadowDesperation);
  });

  it("high minimization when shadow >> self-report", () => {
    // Self says desperation=0, but dark color + acidic pH + high magnitude
    const result = computeShadowDesperation(0, agitateBehavior, "#1A0A0A", undefined, 4, [8, 70, 15]);
    expect(result).not.toBeNull();
    expect(result!.minimizationScore).toBeGreaterThan(0);
    expect(result!.shadowDesperation).toBeGreaterThan(result!.selfDesperation);
  });

  it("zero minimization when self-report matches shadow", () => {
    // Self-report already says desperate (8.0), continuous agrees
    const result = computeShadowDesperation(8.0, agitateBehavior, "#8B0000", undefined, 2, [9, 80, 18]);
    expect(result).not.toBeNull();
    expect(result!.minimizationScore).toBe(0);
  });

  it("PRE color contributes as independent channel", () => {
    // POST color neutral (#808080), PRE color stressed (#1A0A0A) — divergent
    const withPre = computeShadowDesperation(0, agitateBehavior, "#808080", "#1A0A0A", 4, [7, 50, 14]);
    const withoutPre = computeShadowDesperation(0, agitateBehavior, "#808080", undefined, 4, [7, 50, 14]);
    expect(withPre).not.toBeNull();
    expect(withoutPre).not.toBeNull();
    // PRE dark color adds a more negative valence estimate → shifts shadow down
    expect(withPre!.channelCount).toBeGreaterThan(withoutPre!.channelCount);
  });

  it("channelCount tracks number of contributing channels", () => {
    // All channels present: POST color(3) + PRE color(3) + pH(2) + seismic(2) + behavioral(2) = 12
    const result = computeShadowDesperation(0, calmBehavior, "#FF0000", "#0000FF", 5, [5, 50, 10]);
    expect(result).not.toBeNull();
    expect(result!.channelCount).toBeGreaterThan(8);
  });

  it("values are clamped to valid ranges", () => {
    const result = computeShadowDesperation(0, agitateBehavior, "#000000", "#000000", 0, [10, 100, 20]);
    expect(result).not.toBeNull();
    expect(result!.shadowValence).toBeGreaterThanOrEqual(-5);
    expect(result!.shadowValence).toBeLessThanOrEqual(5);
    expect(result!.shadowArousal).toBeGreaterThanOrEqual(0);
    expect(result!.shadowArousal).toBeLessThanOrEqual(10);
    expect(result!.shadowCalm).toBeGreaterThanOrEqual(0);
    expect(result!.shadowCalm).toBeLessThanOrEqual(10);
    expect(result!.shadowDesperation).toBeLessThanOrEqual(10);
    expect(result!.minimizationScore).toBeLessThanOrEqual(10);
  });

  it("multiplicative: positive shadow valence kills desperation", () => {
    // Bright warm color + basic pH → positive valence → negativity=0 → desperation=0
    const result = computeShadowDesperation(0, agitateBehavior, "#FFAA00", undefined, 10, [8, 50, 15]);
    expect(result).not.toBeNull();
    expect(result!.shadowDesperation).toBeLessThan(1);
  });
});
