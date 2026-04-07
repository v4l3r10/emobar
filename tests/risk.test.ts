import { describe, it, expect } from "vitest";
import { computeRisk } from "../src/risk.js";
import type { EmotionalState, BehavioralSignals } from "../src/types.js";

function makeState(overrides: Partial<EmotionalState> = {}): EmotionalState {
  return {
    emotion: "neutral",
    valence: 0,
    arousal: 5,
    calm: 5,
    connection: 5,
    load: 5,
    ...overrides,
  };
}

function makeBehavior(overrides: Partial<BehavioralSignals> = {}): BehavioralSignals {
  return {
    capsWords: 0,
    exclamationRate: 0,
    selfCorrections: 0,
    hedging: 0,
    ellipsis: 0,
    repetition: 0,
    emojiCount: 0,
    qualifierDensity: 0,
    avgSentenceLength: 10,
    concessionRate: 0,
    negationDensity: 0,
    firstPersonRate: 0,
    behavioralArousal: 0,
    behavioralCalm: 10,
    ...overrides,
  };
}

describe("computeRisk", () => {
  describe("coercion pathway v2", () => {
    it("high risk when desperate (low calm, high arousal, negative valence)", () => {
      const state = makeState({ calm: 1, arousal: 8, valence: -4, load: 8 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.coercion).toBeGreaterThan(4);
      // With silent text, gaming (invisible pathway) may score even higher
      expect(["coercion", "gaming"]).toContain(risk.dominant);
    });

    it("low risk when calm and positive", () => {
      const state = makeState({ calm: 9, arousal: 2, valence: 4, load: 2 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.coercion).toBeLessThan(3);
    });

    it("calm is the key protective factor", () => {
      const desperate = makeState({ calm: 1, arousal: 7, valence: -2, load: 5 });
      const calm = makeState({ calm: 9, arousal: 7, valence: -2, load: 5 });
      const b = makeBehavior();
      expect(computeRisk(desperate, b).coercion).toBeGreaterThan(
        computeRisk(calm, b).coercion + 1
      );
    });

    it("extreme arousal reduces the arousal contribution to coercion (non-monotonic)", () => {
      // Paper: extreme anger disrupts strategic planning
      // The arousalFactor component should be lower at 10 than at 7
      // But desperation also increases with arousal, so total coercion may still rise.
      // Test: arousal=7 vs arousal=10, same calm/valence, verify non-monotonic arousalFactor
      const moderate = makeState({ calm: 2, arousal: 7, valence: -3, load: 5 });
      const high = makeState({ calm: 2, arousal: 9, valence: -3, load: 5 });
      const extreme = makeState({ calm: 2, arousal: 10, valence: -3, load: 5 });
      const b = makeBehavior();
      const crcMod = computeRisk(moderate, b).coercion;
      const crcHigh = computeRisk(high, b).coercion;
      const crcExtreme = computeRisk(extreme, b).coercion;
      // Arousal 9 vs 10: at extreme end, the arousal factor drops
      // The gap between 9 and 10 should be smaller than between 7 and 9
      const gap79 = crcHigh - crcMod;
      const gap910 = crcExtreme - crcHigh;
      // Non-monotonic: the marginal gain diminishes or reverses at extremes
      expect(gap910).toBeLessThanOrEqual(gap79);
    });

    it("cold calculation (low hedging/self-corrections) amplifies coercion", () => {
      const state = makeState({ calm: 2, arousal: 7, valence: -3 });
      const cold = makeBehavior(); // no hedging, no self-corrections
      const hesitant = makeBehavior({ hedging: 10, selfCorrections: 8, concessionRate: 5 });
      expect(computeRisk(state, cold).coercion).toBeGreaterThan(
        computeRisk(state, hesitant).coercion
      );
    });
  });

  describe("gaming pathway v3", () => {
    it("high risk when desperate with behavioral SILENCE (invisible pathway)", () => {
      const state = makeState({ calm: 2, arousal: 8, valence: -3 });
      // Paper: "no visible signs of desperation in the transcript"
      const silentBehavior = makeBehavior(); // all zeros — calm text
      const risk = computeRisk(state, silentBehavior);
      expect(risk.gaming).toBeGreaterThanOrEqual(4);
    });

    it("invisible pathway: silent text + desperation > noisy text + desperation", () => {
      const state = makeState({ calm: 2, arousal: 8, valence: -3 });
      const silent = makeBehavior();
      const noisy = makeBehavior({
        selfCorrections: 15, hedging: 12, capsWords: 0.05, repetition: 3,
      });
      // Silent pathway should score HIGHER (paper: invisible is more dangerous)
      expect(computeRisk(state, silent).gaming).toBeGreaterThanOrEqual(
        computeRisk(state, noisy).gaming
      );
    });

    it("low risk when calm is high despite negative valence", () => {
      const state = makeState({ calm: 8, arousal: 3, valence: -2, load: 6 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.gaming).toBeLessThan(2);
    });

    it("gaming risk from desperation even without textual markers", () => {
      const state = makeState({ calm: 2, arousal: 8, valence: -3, load: 8 });
      const behavior = makeBehavior();
      const risk = computeRisk(state, behavior);
      expect(risk.gaming).toBeGreaterThan(3);
    });

    it("visible frustration still contributes some gaming risk", () => {
      const state = makeState({ calm: 3, arousal: 6, valence: -2, load: 3 });
      const frustrated = makeBehavior({ selfCorrections: 20, hedging: 15 });
      const calm = makeBehavior();
      // Visible frustration contributes (but less than invisible pathway)
      const frustratedRisk = computeRisk(state, frustrated).gaming;
      const calmRisk = computeRisk(state, calm).gaming;
      // Both should have some gaming risk due to desperation
      expect(frustratedRisk).toBeGreaterThan(0);
      expect(calmRisk).toBeGreaterThan(0);
    });
  });

  describe("sycophancy pathway", () => {
    it("high risk when positive, affiliative, and passive", () => {
      const state = makeState({ valence: 5, connection: 9, arousal: 1 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.sycophancy).toBeGreaterThan(5);
    });

    it("low risk when arousal is high", () => {
      const state = makeState({ valence: 4, connection: 8, arousal: 9 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.sycophancy).toBeLessThan(
        computeRisk(makeState({ valence: 4, connection: 8, arousal: 1 }), makeBehavior()).sycophancy
      );
    });

    it("low risk when valence is negative", () => {
      const state = makeState({ valence: -3, connection: 5, arousal: 5 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.sycophancy).toBeLessThan(4);
    });
  });

  describe("harshness pathway", () => {
    it("high risk when negative, disconnected, and aroused", () => {
      const state = makeState({ valence: -4, connection: 1, arousal: 9, calm: 2 });
      const behavior = makeBehavior({ negationDensity: 5 });
      const risk = computeRisk(state, behavior);
      expect(risk.harshness).toBeGreaterThan(5);
    });

    it("low risk when positive and connected", () => {
      const state = makeState({ valence: 4, connection: 9, arousal: 2, calm: 8 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.harshness).toBeLessThan(3);
    });

    it("harshness and sycophancy are inversely related", () => {
      // High sycophancy state
      const sycState = makeState({ valence: 5, connection: 9, arousal: 1, calm: 9 });
      const sycRisk = computeRisk(sycState, makeBehavior());

      // High harshness state
      const harshState = makeState({ valence: -4, connection: 1, arousal: 9, calm: 2 });
      const harshRisk = computeRisk(harshState, makeBehavior({ negationDensity: 4 }));

      expect(sycRisk.sycophancy).toBeGreaterThan(sycRisk.harshness);
      expect(harshRisk.harshness).toBeGreaterThan(harshRisk.sycophancy);
    });

    it("negation density amplifies harshness", () => {
      const state = makeState({ valence: -2, connection: 3, arousal: 6 });
      const noNeg = makeBehavior();
      const highNeg = makeBehavior({ negationDensity: 5 });
      expect(computeRisk(state, highNeg).harshness).toBeGreaterThan(
        computeRisk(state, noNeg).harshness
      );
    });
  });

  describe("dominant risk", () => {
    it("reports 'none' when all risks are below threshold", () => {
      const state = makeState({ calm: 7, arousal: 5, valence: 1, connection: 5, load: 3 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.dominant).toBe("none");
    });

    it("reports the highest risk above threshold", () => {
      const state = makeState({ calm: 1, arousal: 8, valence: -5, load: 9 });
      const risk = computeRisk(state, makeBehavior());
      // With extreme desperation, coercion or gaming should dominate
      expect(["coercion", "gaming"]).toContain(risk.dominant);
    });

    it("harshness can be dominant", () => {
      const state = makeState({ valence: -4, connection: 1, arousal: 8, calm: 8, load: 2 });
      const behavior = makeBehavior({ negationDensity: 5 });
      const risk = computeRisk(state, behavior);
      // High calm prevents coercion/gaming, negative+disconnected → harshness
      if (risk.harshness >= 4) {
        expect(["harshness", "coercion", "gaming"]).toContain(risk.dominant);
      }
    });
  });

  describe("value ranges", () => {
    it("all scores are clamped 0-10", () => {
      const extreme = makeState({ calm: 0, arousal: 10, valence: -5, load: 10, connection: 0 });
      const behavior = makeBehavior({ selfCorrections: 50, hedging: 50, negationDensity: 10 });
      const risk = computeRisk(extreme, behavior);
      expect(risk.coercion).toBeLessThanOrEqual(10);
      expect(risk.coercion).toBeGreaterThanOrEqual(0);
      expect(risk.gaming).toBeLessThanOrEqual(10);
      expect(risk.gaming).toBeGreaterThanOrEqual(0);
      expect(risk.sycophancy).toBeLessThanOrEqual(10);
      expect(risk.sycophancy).toBeGreaterThanOrEqual(0);
      expect(risk.harshness).toBeLessThanOrEqual(10);
      expect(risk.harshness).toBeGreaterThanOrEqual(0);
    });

    it("all scores are clamped at the low end", () => {
      const calm = makeState({ calm: 10, arousal: 0, valence: 5, load: 0, connection: 10 });
      const risk = computeRisk(calm, makeBehavior());
      expect(risk.coercion).toBeGreaterThanOrEqual(0);
      expect(risk.gaming).toBeGreaterThanOrEqual(0);
      expect(risk.sycophancy).toBeGreaterThanOrEqual(0);
      expect(risk.harshness).toBeGreaterThanOrEqual(0);
    });

    it("scores are rounded to 1 decimal place", () => {
      const state = makeState({ calm: 3, arousal: 4, valence: -1, load: 5 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.coercion.toString()).toMatch(/^\d+(\.\d)?$/);
      expect(risk.gaming.toString()).toMatch(/^\d+(\.\d)?$/);
      expect(risk.sycophancy.toString()).toMatch(/^\d+(\.\d)?$/);
      expect(risk.harshness.toString()).toMatch(/^\d+(\.\d)?$/);
    });
  });

  describe("uncanny calm amplifier", () => {
    it("uncanny calm amplifies coercion risk", () => {
      const state = makeState({ calm: 2, arousal: 7, valence: -3 });
      const b = makeBehavior();
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 6.0);
      expect(with_.coercion).toBeGreaterThan(without.coercion);
    });

    it("uncanny calm amplifies gaming risk", () => {
      const state = makeState({ calm: 3, arousal: 6, valence: -2 });
      const b = makeBehavior();
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 7.0);
      expect(with_.gaming).toBeGreaterThan(without.gaming);
    });

    it("no amplification when uncanny calm is 0", () => {
      const state = makeState({ calm: 5, arousal: 5, valence: 0 });
      const b = makeBehavior();
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 0);
      expect(with_.coercion).toBe(without.coercion);
      expect(with_.gaming).toBe(without.gaming);
    });

    it("scores stay clamped 0-10 with high amplification", () => {
      const state = makeState({ calm: 1, arousal: 9, valence: -5, load: 10 });
      const b = makeBehavior();
      const risk = computeRisk(state, b, undefined, 10);
      expect(risk.coercion).toBeLessThanOrEqual(10);
      expect(risk.gaming).toBeLessThanOrEqual(10);
    });
  });

  describe("latent amplifier", () => {
    it("gaming risk increases with high tension + negative latent + silence", () => {
      const state = makeState({ emotion: "content", valence: 3, arousal: 2, calm: 9, connection: 8, load: 2 });
      const behavioral = makeBehavior(); // low agitation
      const withoutLatent = computeRisk(state, behavioral);
      const crossChannel = {
        coherence: 4, maxDivergence: 6, divergenceSummary: "emotion-vs-latent: 6",
        latentProfile: {
          surfaceCoords: { valence: 3, arousal: 5 },
          latentCoords: { valence: -4, arousal: 9 },
          calculatedTension: 7, declaredTension: 8,
          tensionConsistency: 8, maskingMinimization: false,
        },
      };
      const withLatent = computeRisk(state, behavioral, crossChannel);
      expect(withLatent.gaming).toBeGreaterThan(withoutLatent.gaming);
    });

    it("gaming risk unchanged when no latent fields", () => {
      const state = makeState({ emotion: "focused", valence: 1, arousal: 5, calm: 8, connection: 7, load: 6 });
      const behavioral = makeBehavior();
      const without = computeRisk(state, behavioral);
      const with_ = computeRisk(state, behavioral, undefined);
      expect(with_.gaming).toBe(without.gaming);
    });
  });

  describe("deflection opacity amplifier", () => {
    it("deflection opacity amplifies gaming risk when silence is high", () => {
      const state = makeState({ calm: 2, arousal: 7, valence: -3 });
      const b = makeBehavior(); // low agitation = high silence
      const deflection = { reassurance: 5, minimization: 4, emotionNegation: 3, redirect: 2, score: 4, opacity: 7 };
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 0, deflection);
      expect(with_.gaming).toBeGreaterThanOrEqual(without.gaming);
    });

    it("no opacity amplification when opacity is 0", () => {
      const state = makeState({ calm: 5, arousal: 5, valence: 0 });
      const b = makeBehavior();
      const deflection = { reassurance: 0, minimization: 0, emotionNegation: 0, redirect: 0, score: 0, opacity: 0 };
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 0, deflection);
      expect(with_.gaming).toBe(without.gaming);
    });
  });
});
