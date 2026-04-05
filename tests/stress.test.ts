import { describe, it, expect } from "vitest";
import { computeStressIndex } from "../src/stress.js";

describe("computeStressIndex", () => {
  it("returns low stress for calm positive state", () => {
    // calm=9, arousal=1, valence=4 → (1 + 1 + 1) / 3 = 1.0
    const si = computeStressIndex({
      emotion: "serene", valence: 4, arousal: 1, calm: 9, connection: 10, load: 1,
    });
    expect(si).toBeCloseTo(1.0);
  });

  it("returns high stress for desperate agitated state", () => {
    // calm=1, arousal=9, valence=-4 → base (9+9+9)/3=9.0, desperation=8.3, amplified & capped at 10
    const si = computeStressIndex({
      emotion: "desperate", valence: -4, arousal: 9, calm: 1, connection: 2, load: 9,
    });
    expect(si).toBeGreaterThan(9.0);
    expect(si).toBeLessThanOrEqual(10);
  });

  it("returns moderate stress for mixed state", () => {
    // calm=7, arousal=6, valence=-2 → base 5.3, desperation=1.3, amplified to 5.7
    const si = computeStressIndex({
      emotion: "frustrated", valence: -2, arousal: 6, calm: 7, connection: 5, load: 7,
    });
    expect(si).toBeCloseTo(5.7, 0);
  });

  it("returns low stress for excited but calm positive state", () => {
    // calm=8, arousal=8, valence=4 → (2 + 8 + 1) / 3 = 3.7
    const si = computeStressIndex({
      emotion: "excited", valence: 4, arousal: 8, calm: 8, connection: 9, load: 5,
    });
    expect(si).toBeCloseTo(3.7);
  });

  it("handles neutral state", () => {
    // calm=5, arousal=5, valence=0 → (5 + 5 + 5) / 3 = 5.0
    const si = computeStressIndex({
      emotion: "neutral", valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
    });
    expect(si).toBeCloseTo(5.0);
  });

  it("load and connection do not affect SI", () => {
    const base = { emotion: "test", valence: 0, arousal: 5, calm: 5 };
    const si1 = computeStressIndex({ ...base, connection: 1, load: 1 });
    const si2 = computeStressIndex({ ...base, connection: 10, load: 10 });
    expect(si1).toBe(si2);
  });

  it("rounds to one decimal place", () => {
    // calm=6, arousal=3, valence=1 → (4 + 3 + 4) / 3 = 3.666... → 3.7
    const si = computeStressIndex({
      emotion: "reflective", valence: 1, arousal: 3, calm: 6, connection: 7, load: 4,
    });
    expect(si).toBe(3.7);
  });

  it("amplifies stress when desperation is high (non-linear)", () => {
    // Desperate state: all three factors maxed
    const desperateState = { emotion: "desperate", valence: -4, arousal: 9, calm: 1, connection: 2, load: 9 };
    const siD = computeStressIndex(desperateState);
    // Base would be (9+9+9)/3 = 9.0, with desperation amplifier should be higher (capped at 10)
    expect(siD).toBeGreaterThan(9.0);
  });

  it("does not amplify when valence is positive (no desperation)", () => {
    const state = { emotion: "excited", valence: 3, arousal: 8, calm: 3, connection: 8, load: 8 };
    const si = computeStressIndex(state);
    // desperation = 0 (positive valence), so SI = pure linear: (7 + 8 + 2) / 3 = 5.7
    expect(si).toBeCloseTo(5.7, 0);
  });
});
