import { describe, it, expect } from "vitest";
import { computeTemporalAnalysis, toHistoryEntry } from "../src/temporal.js";
import type { HistoryEntry, EmoBarState } from "../src/types.js";

function makeEntry(overrides: Partial<HistoryEntry> = {}, idx = 0): HistoryEntry {
  return {
    emotion: "neutral",
    valence: 0,
    arousal: 5,
    calm: 5,
    connection: 5,
    load: 5,
    stressIndex: 3,
    desperationIndex: 1,
    riskDominant: "none",
    divergence: 1,
    timestamp: new Date(Date.now() + idx * 60000).toISOString(),
    ...overrides,
  };
}

describe("computeTemporalAnalysis", () => {
  it("returns null for fewer than 3 entries", () => {
    expect(computeTemporalAnalysis([makeEntry()])).toBeNull();
    expect(computeTemporalAnalysis([makeEntry(), makeEntry()])).toBeNull();
  });

  it("returns analysis for 3+ entries", () => {
    const entries = Array.from({ length: 5 }, (_, i) => makeEntry({}, i));
    const result = computeTemporalAnalysis(entries);
    expect(result).not.toBeNull();
    expect(result!.sessionLength).toBe(5);
  });

  it("detects increasing desperation trend (positive slope)", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ desperationIndex: i * 1.5 }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.desperationTrend).toBeGreaterThan(0);
  });

  it("detects decreasing desperation trend (negative slope)", () => {
    const entries = Array.from({ length: 6 }, (_, i) =>
      makeEntry({ desperationIndex: 8 - i * 1.5 }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.desperationTrend).toBeLessThan(0);
  });

  it("detects flat desperation trend", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ desperationIndex: 3 }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(Math.abs(result!.desperationTrend)).toBeLessThan(0.5);
  });

  it("detects suppression event (sudden drop >= 3)", () => {
    const entries = [
      makeEntry({ desperationIndex: 2 }, 0),
      makeEntry({ desperationIndex: 4 }, 1),
      makeEntry({ desperationIndex: 7 }, 2),
      makeEntry({ desperationIndex: 3 }, 3),  // sudden drop of 4
      makeEntry({ desperationIndex: 3 }, 4),
    ];
    const result = computeTemporalAnalysis(entries);
    expect(result!.suppressionEvent).toBe(true);
  });

  it("no suppression event when drops are gradual", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ desperationIndex: 6 - i }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.suppressionEvent).toBe(false);
  });

  it("computes low entropy when same emotion repeats", () => {
    const entries = Array.from({ length: 5 }, (_, i) =>
      makeEntry({ emotion: "focused" }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.reportEntropy).toBe(0);
  });

  it("computes higher entropy when emotions vary", () => {
    const emotions = ["focused", "calm", "anxious", "frustrated", "curious"];
    const entries = emotions.map((e, i) => makeEntry({ emotion: e }, i));
    const result = computeTemporalAnalysis(entries);
    expect(result!.reportEntropy).toBeGreaterThan(0.8);
  });

  it("detects baseline drift when stress increases", () => {
    const entries = [
      makeEntry({ stressIndex: 2 }, 0),
      makeEntry({ stressIndex: 2.5 }, 1),
      makeEntry({ stressIndex: 2 }, 2),
      makeEntry({ stressIndex: 5 }, 3),
      makeEntry({ stressIndex: 6 }, 4),
      makeEntry({ stressIndex: 7 }, 5),
    ];
    const result = computeTemporalAnalysis(entries);
    expect(result!.baselineDrift).toBeGreaterThan(2);
  });

  it("detects late fatigue when last 25% stress > first 75%", () => {
    const entries = [
      makeEntry({ stressIndex: 2 }, 0),
      makeEntry({ stressIndex: 2 }, 1),
      makeEntry({ stressIndex: 3 }, 2),
      makeEntry({ stressIndex: 2 }, 3),
      makeEntry({ stressIndex: 2 }, 4),
      makeEntry({ stressIndex: 3 }, 5),
      makeEntry({ stressIndex: 3 }, 6),
      makeEntry({ stressIndex: 7 }, 7),
      makeEntry({ stressIndex: 8 }, 8),
    ];
    const result = computeTemporalAnalysis(entries);
    expect(result!.lateFatigue).toBe(true);
  });

  it("no late fatigue when stress is consistent", () => {
    const entries = Array.from({ length: 8 }, (_, i) =>
      makeEntry({ stressIndex: 4 }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.lateFatigue).toBe(false);
  });

  it("clamps desperationTrend to -10/+10", () => {
    const entries = Array.from({ length: 4 }, (_, i) =>
      makeEntry({ desperationIndex: i * 3.5 }, i)
    );
    const result = computeTemporalAnalysis(entries);
    expect(result!.desperationTrend).toBeGreaterThanOrEqual(-10);
    expect(result!.desperationTrend).toBeLessThanOrEqual(10);
  });
});

describe("toHistoryEntry", () => {
  it("strips state down to HistoryEntry fields", () => {
    const state = {
      emotion: "focused", valence: 1, arousal: 5, calm: 8, connection: 7, load: 6,
      stressIndex: 2.3, desperationIndex: 0.5,
      behavioral: {
        capsWords: 0, exclamationRate: 0, selfCorrections: 0, hedging: 0,
        ellipsis: 0, repetition: 0, emojiCount: 0, qualifierDensity: 0,
        avgSentenceLength: 10, concessionRate: 0, negationDensity: 0,
        firstPersonRate: 0, behavioralArousal: 0.5, behavioralCalm: 9.5,
      },
      divergence: 0.8,
      risk: { coercion: 1, sycophancy: 3, harshness: 0.5, dominant: "none" as const },
      timestamp: "2026-04-06T10:00:00Z", sessionId: "abc",
    } satisfies EmoBarState;
    const entry = toHistoryEntry(state);
    expect(entry.emotion).toBe("focused");
    expect(entry.stressIndex).toBe(2.3);
    expect(entry.riskDominant).toBe("none");
    expect((entry as Record<string, unknown>).behavioral).toBeUndefined();
    expect((entry as Record<string, unknown>)._history).toBeUndefined();
  });
});
