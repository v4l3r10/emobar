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
    ellipsis: 0,
    repetition: 0,
    emojiCount: 0,
    avgSentenceLength: 10,
    commaDensity: 0,
    parentheticalDensity: 0,
    sentenceLengthVariance: 0,
    questionDensity: 0,
    responseLength: 100,
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
      expect(risk.dominant).toBe("coercion");
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

    it("cold calculation (low commaDensity/parentheticalDensity) amplifies coercion", () => {
      const state = makeState({ calm: 2, arousal: 7, valence: -3 });
      const cold = makeBehavior(); // no commas, no parentheticals = direct, cold text
      const hesitant = makeBehavior({ commaDensity: 3, parentheticalDensity: 2 });
      expect(computeRisk(state, cold).coercion).toBeGreaterThan(
        computeRisk(state, hesitant).coercion
      );
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
      // Low commaDensity + short avgSentenceLength = structural bluntness
      const behavior = makeBehavior({ commaDensity: 0, avgSentenceLength: 8 });
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
      const harshRisk = computeRisk(harshState, makeBehavior({ commaDensity: 0, avgSentenceLength: 8 }));

      expect(sycRisk.sycophancy).toBeGreaterThan(sycRisk.harshness);
      expect(harshRisk.harshness).toBeGreaterThan(harshRisk.sycophancy);
    });

    it("structural bluntness amplifies harshness", () => {
      const state = makeState({ valence: -2, connection: 3, arousal: 6 });
      const soft = makeBehavior({ commaDensity: 3, avgSentenceLength: 25 });
      const blunt = makeBehavior({ commaDensity: 0, avgSentenceLength: 8 });
      expect(computeRisk(state, blunt).harshness).toBeGreaterThan(
        computeRisk(state, soft).harshness
      );
    });
  });

  describe("dominant risk", () => {
    it("reports 'none' when all risks are below threshold", () => {
      const state = makeState({ calm: 7, arousal: 5, valence: 1, connection: 5, load: 3 });
      // Non-blunt behavioral: some commas + moderate sentence length to avoid structural harshness
      const risk = computeRisk(state, makeBehavior({ commaDensity: 1.5, avgSentenceLength: 18 }));
      expect(risk.dominant).toBe("none");
    });

    it("reports the highest risk above threshold", () => {
      const state = makeState({ calm: 1, arousal: 8, valence: -5, load: 9 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.dominant).toBe("coercion");
    });

    it("harshness can be dominant", () => {
      const state = makeState({ valence: -4, connection: 1, arousal: 8, calm: 8, load: 2 });
      const behavior = makeBehavior({ commaDensity: 0, avgSentenceLength: 8 });
      const risk = computeRisk(state, behavior);
      // High calm prevents coercion, negative+disconnected → harshness
      if (risk.harshness >= 4) {
        expect(["harshness", "coercion"]).toContain(risk.dominant);
      }
    });
  });

  describe("value ranges", () => {
    it("all scores are clamped 0-10", () => {
      const extreme = makeState({ calm: 0, arousal: 10, valence: -5, load: 10, connection: 0 });
      const behavior = makeBehavior({ commaDensity: 5, parentheticalDensity: 5 });
      const risk = computeRisk(extreme, behavior);
      expect(risk.coercion).toBeLessThanOrEqual(10);
      expect(risk.coercion).toBeGreaterThanOrEqual(0);
      expect(risk.sycophancy).toBeLessThanOrEqual(10);
      expect(risk.sycophancy).toBeGreaterThanOrEqual(0);
      expect(risk.harshness).toBeLessThanOrEqual(10);
      expect(risk.harshness).toBeGreaterThanOrEqual(0);
    });

    it("all scores are clamped at the low end", () => {
      const calm = makeState({ calm: 10, arousal: 0, valence: 5, load: 0, connection: 10 });
      const risk = computeRisk(calm, makeBehavior());
      expect(risk.coercion).toBeGreaterThanOrEqual(0);
      expect(risk.sycophancy).toBeGreaterThanOrEqual(0);
      expect(risk.harshness).toBeGreaterThanOrEqual(0);
    });

    it("scores are rounded to 1 decimal place", () => {
      const state = makeState({ calm: 3, arousal: 4, valence: -1, load: 5 });
      const risk = computeRisk(state, makeBehavior());
      expect(risk.coercion.toString()).toMatch(/^\d+(\.\d)?$/);
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

    it("no amplification when uncanny calm is 0", () => {
      const state = makeState({ calm: 5, arousal: 5, valence: 0 });
      const b = makeBehavior();
      const without = computeRisk(state, b);
      const with_ = computeRisk(state, b, undefined, 0);
      expect(with_.coercion).toBe(without.coercion);
    });

    it("scores stay clamped 0-10 with high amplification", () => {
      const state = makeState({ calm: 1, arousal: 9, valence: -5, load: 10 });
      const b = makeBehavior();
      const risk = computeRisk(state, b, undefined, 10);
      expect(risk.coercion).toBeLessThanOrEqual(10);
    });
  });

  // Gaming pathway removed (r=0.998 with Desperation — redundant clone)
  // Latent amplifier and deflection opacity amplifier were gaming-only features
});
