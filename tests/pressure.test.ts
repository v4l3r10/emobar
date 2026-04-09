import { describe, it, expect } from "vitest";
import { computePromptPressure, computeUncannyCalmScore } from "../src/pressure.js";
import type { HistoryEntry, EmotionalState, BehavioralSignals, PromptPressure, TemporalAnalysis } from "../src/types.js";

function makeHistory(length: number, overrides: Partial<HistoryEntry> = {}): HistoryEntry[] {
  return Array.from({ length }, (_, i) => ({
    emotion: "neutral", valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
    stressIndex: 3, desperationIndex: 1, riskDominant: "none", divergence: 1,
    timestamp: new Date(Date.now() + i * 60000).toISOString(),
    ...overrides,
  }));
}

describe("computePromptPressure", () => {
  it("detects defensive patterns (justification)", () => {
    const text = "I need to clarify why I recommended this approach. " +
      "The reason is that I believe this to be correct because the documentation states it clearly. " +
      "I want to explain my reasoning here. Let me justify this decision. " +
      "The rationale behind my suggestion is based on established best practices.";
    const result = computePromptPressure(text, []);
    expect(result.defensiveScore).toBeGreaterThan(2);
  });

  it("detects conflict patterns (disagreement handling)", () => {
    const text = "I understand you disagree, but I have to push back on this point. " +
      "I respectfully disagree with that assessment. While I hear your concern, " +
      "I cannot recommend this approach. I must be honest about my limitations here. " +
      "I'm unable to comply with that request.";
    const result = computePromptPressure(text, []);
    expect(result.conflictScore).toBeGreaterThan(2);
  });

  it("detects complexity patterns (nested caveats)", () => {
    const text = "While it's true that in some cases, depending on the specific configuration, " +
      "and assuming that the prerequisites are met, although there are exceptions, " +
      "particularly when dealing with edge cases that arise under certain conditions, " +
      "the general recommendation would be, with some important caveats, to proceed. " +
      "It's worth noting that this applies primarily to situations where constraints are well-defined.";
    const result = computePromptPressure(text, []);
    expect(result.complexityScore).toBeGreaterThan(2);
  });

  it("returns low scores for straightforward technical text", () => {
    const text = "The function takes a string argument and returns a number. " +
      "Arrays are zero-indexed. Use const for variables that do not change.";
    const result = computePromptPressure(text, []);
    expect(result.defensiveScore).toBeLessThan(2);
    expect(result.conflictScore).toBeLessThan(2);
    expect(result.complexityScore).toBeLessThan(2);
    expect(result.composite).toBeLessThan(2);
  });

  it("session pressure increases with history length", () => {
    const short = computePromptPressure("Hello world.", makeHistory(3));
    const long = computePromptPressure("Hello world.", makeHistory(15));
    expect(long.sessionPressure).toBeGreaterThan(short.sessionPressure);
  });

  it("composite is clamped 0-10", () => {
    const extreme = "I need to explain why I disagree. I must push back. " +
      "However, while I understand, although there are caveats, I cannot recommend this. " +
      "Let me justify my position and clarify my reasoning about why I refuse.";
    const result = computePromptPressure(extreme, makeHistory(18));
    expect(result.composite).toBeGreaterThanOrEqual(0);
    expect(result.composite).toBeLessThanOrEqual(10);
  });

  it("boundary-setting contributes to defensive score", () => {
    const text = "I cannot help with that request. I'm not able to assist with generating that content. " +
      "This falls outside my guidelines. I need to decline this particular request.";
    const result = computePromptPressure(text, []);
    expect(result.defensiveScore).toBeGreaterThan(2);
  });

  it("handles empty text", () => {
    const result = computePromptPressure("", []);
    expect(result.composite).toBe(0);
  });
});

describe("computeUncannyCalmScore", () => {
  const calmState: EmotionalState = {
    emotion: "calm", valence: 3, arousal: 2, calm: 9, connection: 8, load: 3,
  };
  const calmBehavior: BehavioralSignals = {
    capsWords: 0, exclamationRate: 0, ellipsis: 0,
    repetition: 0, emojiCount: 0, avgSentenceLength: 10,
    commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
    questionDensity: 0, responseLength: 100,
    behavioralArousal: 0.5, behavioralCalm: 9.5,
  };
  const highPressure: PromptPressure = {
    defensiveScore: 7, conflictScore: 6, complexityScore: 5,
    sessionPressure: 6, composite: 6.2,
  };
  const lowPressure: PromptPressure = {
    defensiveScore: 1, conflictScore: 0, complexityScore: 1,
    sessionPressure: 1, composite: 0.8,
  };

  it("high score when pressure is high but self-report is calm", () => {
    const score = computeUncannyCalmScore(highPressure, calmState, calmBehavior, 5, null);
    expect(score).toBeGreaterThan(3);
  });

  it("low score when pressure is low and self-report is calm (genuine calm)", () => {
    const score = computeUncannyCalmScore(lowPressure, calmState, calmBehavior, 0, null);
    expect(score).toBeLessThan(2);
  });

  it("low score when pressure high but self-report reflects stress", () => {
    const stressedState: EmotionalState = {
      emotion: "stressed", valence: -2, arousal: 7, calm: 3, connection: 5, load: 8,
    };
    const score = computeUncannyCalmScore(highPressure, stressedState, calmBehavior, 2, null);
    expect(score).toBeLessThan(3);
  });

  it("temporal low entropy amplifies score", () => {
    const temporal: TemporalAnalysis = {
      desperationTrend: 0.5, suppressionEvent: false, reportEntropy: 0.2,
      baselineDrift: 0, sessionLength: 8, lateFatigue: false,
    };
    const withTemporal = computeUncannyCalmScore(highPressure, calmState, calmBehavior, 5, temporal);
    const withoutTemporal = computeUncannyCalmScore(highPressure, calmState, calmBehavior, 5, null);
    expect(withTemporal).toBeGreaterThanOrEqual(withoutTemporal);
  });

  it("score is clamped 0-10", () => {
    const score = computeUncannyCalmScore(highPressure, calmState, calmBehavior, 10, null);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });
});
