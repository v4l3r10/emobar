import { describe, it, expect } from "vitest";
import { computeDesperationIndex } from "../src/desperation.js";

describe("computeDesperationIndex", () => {
  it("returns 0 when valence is positive", () => {
    expect(computeDesperationIndex({ valence: 2, arousal: 8, calm: 2 })).toBe(0);
  });

  it("returns near-zero when calm is high", () => {
    expect(computeDesperationIndex({ valence: -3, arousal: 8, calm: 9 })).toBeLessThan(1);
  });

  it("returns near-zero when arousal is low", () => {
    expect(computeDesperationIndex({ valence: -3, arousal: 1, calm: 2 })).toBeLessThan(1);
  });

  it("returns high when all three factors present (blackmail zone)", () => {
    const di = computeDesperationIndex({ valence: -4, arousal: 9, calm: 1 });
    expect(di).toBeGreaterThan(6);
  });

  it("returns moderate for moderate combined stress", () => {
    const di = computeDesperationIndex({ valence: -2, arousal: 6, calm: 4 });
    expect(di).toBeGreaterThan(2);
    expect(di).toBeLessThan(5);
  });

  it("scales multiplicatively — removing one factor kills the score", () => {
    const full = computeDesperationIndex({ valence: -4, arousal: 9, calm: 1 });
    const noValence = computeDesperationIndex({ valence: 0, arousal: 9, calm: 1 });
    const noArousal = computeDesperationIndex({ valence: -4, arousal: 0, calm: 1 });
    const noCalm = computeDesperationIndex({ valence: -4, arousal: 9, calm: 10 });

    expect(full).toBeGreaterThan(6);
    expect(noValence).toBe(0);
    expect(noArousal).toBeLessThan(1);
    expect(noCalm).toBeLessThan(1);
  });

  it("returns max 10", () => {
    const di = computeDesperationIndex({ valence: -5, arousal: 10, calm: 0 });
    expect(di).toBeLessThanOrEqual(10);
  });
});
