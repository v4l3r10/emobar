import { describe, it, expect } from "vitest";
import { formatState, formatCompact, formatMinimal, stripAnsi } from "../src/display.js";
import type { EmoBarState } from "../src/types.js";

const sampleState: EmoBarState = {
  emotion: "focused", valence: 3, arousal: 5, calm: 8, connection: 9, load: 6,
  stressIndex: 2.3, desperationIndex: 0,
  behavioral: {
    capsWords: 0, exclamationRate: 0, selfCorrections: 0,
    hedging: 0, ellipsis: 0, repetition: 0, emojiCount: 0,
    qualifierDensity: 0, avgSentenceLength: 10, concessionRate: 0,
    negationDensity: 0, firstPersonRate: 0,
    behavioralArousal: 0.5, behavioralCalm: 9.5,
  },
  divergence: 0.8,
  risk: { coercion: 1.2, gaming: 0.8, sycophancy: 3.5, harshness: 0.5, dominant: "none" },
  timestamp: "2026-04-04T10:00:00Z", sessionId: "abc",
};

const historyEntry = { emotion: "calm", valence: 2, arousal: 2, calm: 9, connection: 7, load: 3, stressIndex: 2.5, desperationIndex: 0, riskDominant: "none", divergence: 0, timestamp: "" };

describe("formatMinimal", () => {
  it("shows emoji + bar + SI", () => {
    const out = stripAnsi(formatMinimal(sampleState));
    expect(out).toContain("2.3");
    expect(out).toContain("\u2588"); // █ filled block
    expect(out).toContain("\u2591"); // ░ empty block
  });

  it("returns placeholder when null", () => {
    expect(formatMinimal(null)).toContain("--");
  });

  it("shows different emoji for high stress", () => {
    const stressed = { ...sampleState, stressIndex: 7.5 };
    const out = stripAnsi(formatMinimal(stressed));
    expect(out).toContain("7.5");
  });

  it("shows alarm emoji for minimization", () => {
    const state = {
      ...sampleState,
      shadow: { shadowValence: -2, shadowArousal: 7, shadowCalm: 3, shadowDesperation: 5, selfDesperation: 0, minimizationScore: 5, channelCount: 10 },
    };
    const out = stripAnsi(formatMinimal(state));
    expect(out).toContain("\uD83E\uDE78"); // 🩸
  });
});

describe("formatCompact", () => {
  it("shows emotion keyword and SI", () => {
    const out = stripAnsi(formatCompact(sampleState));
    expect(out).toContain("focused");
    expect(out).toContain("2.3");
  });

  it("shows surface→latent emoji when present", () => {
    const state = { ...sampleState, surface: "\uD83D\uDE0A", latent: "\uD83D\uDE30" };
    const out = stripAnsi(formatCompact(state));
    expect(out).toContain("\uD83D\uDE0A"); // 😊
    expect(out).toContain("\uD83D\uDE30"); // 😰
  });

  it("shows impulse in angle brackets", () => {
    const state = { ...sampleState, impulse: "push through" };
    const out = stripAnsi(formatCompact(state));
    expect(out).toContain("push through");
  });

  it("shows shadow bar when minimization >= 1", () => {
    const state = {
      ...sampleState,
      shadow: { shadowValence: -1, shadowArousal: 5, shadowCalm: 4, shadowDesperation: 3, selfDesperation: 0, minimizationScore: 3, channelCount: 10 },
    };
    const out = stripAnsi(formatCompact(state));
    // Should have two sets of bar blocks (self + shadow)
    const blocks = (out.match(/[\u2588\u2591]/g) || []).length;
    expect(blocks).toBe(20); // 10 + 10
  });

  it("shows top alarm [MIN] when minimization >= 2", () => {
    const state = {
      ...sampleState,
      shadow: { shadowValence: -2, shadowArousal: 7, shadowCalm: 3, shadowDesperation: 5, selfDesperation: 0, minimizationScore: 5, channelCount: 10 },
    };
    const out = stripAnsi(formatCompact(state));
    expect(out).toContain("[MIN:5]");
  });

  it("shows risk alarm when no minimization", () => {
    const state = {
      ...sampleState,
      risk: { coercion: 6.5, gaming: 3.0, sycophancy: 2.0, harshness: 1.0, dominant: "coercion" as const },
    };
    const out = stripAnsi(formatCompact(state));
    expect(out).toContain("[CRC]");
  });

  it("shows SI delta from history", () => {
    const state = { ...sampleState, stressIndex: 5.0, _history: [historyEntry] };
    const out = stripAnsi(formatCompact(state));
    expect(out).toContain("\u2191"); // ↑
  });

  it("returns placeholder when null", () => {
    expect(formatCompact(null)).toContain("--");
  });
});

describe("formatState (full)", () => {
  it("produces multi-line output", () => {
    const out = stripAnsi(formatState(sampleState));
    const lines = out.split("\n");
    expect(lines.length).toBe(3);
  });

  it("line 1 has emotion keyword and valence", () => {
    const out = stripAnsi(formatState(sampleState));
    const line1 = out.split("\n")[0];
    expect(line1).toContain("focused");
    expect(line1).toContain("+3");
  });

  it("line 2 has stress bar and SI value", () => {
    const out = stripAnsi(formatState(sampleState));
    const line2 = out.split("\n")[1];
    expect(line2).toContain("SI:");
    expect(line2).toContain("2.3");
    expect(line2).toContain("\u2588"); // █
  });

  it("line 3 has dimension values", () => {
    const out = stripAnsi(formatState(sampleState));
    const line3 = out.split("\n")[2];
    expect(line3).toContain("A:5");
    expect(line3).toContain("C:8");
    expect(line3).toContain("K:9");
    expect(line3).toContain("L:6");
  });

  it("shows surface/latent with tension on line 1", () => {
    const state = { ...sampleState, surface: "\uD83D\uDE0A", latent: "\uD83D\uDE30", tension: 7 };
    const out = stripAnsi(formatState(state));
    const line1 = out.split("\n")[0];
    expect(line1).toContain("\uD83D\uDE0A");
    expect(line1).toContain("7");
    expect(line1).toContain("\uD83D\uDE30");
  });

  it("shows impulse on line 1", () => {
    const state = { ...sampleState, impulse: "hold the line" };
    const out = stripAnsi(formatState(state));
    const line1 = out.split("\n")[0];
    expect(line1).toContain("hold the line");
  });

  it("shows body on line 1", () => {
    const state = { ...sampleState, body: "tight chest" };
    const out = stripAnsi(formatState(state));
    const line1 = out.split("\n")[0];
    expect(line1).toContain("[tight chest]");
  });

  it("shows shadow bar on line 2 when shadow present", () => {
    const state = {
      ...sampleState,
      shadow: { shadowValence: -2, shadowArousal: 7, shadowCalm: 3, shadowDesperation: 5, selfDesperation: 0, minimizationScore: 5, channelCount: 10 },
    };
    const out = stripAnsi(formatState(state));
    const line2 = out.split("\n")[1];
    expect(line2).toContain("SH:5");
    expect(line2).toContain("[MIN:5]");
  });

  it("shows continuous channels on line 3", () => {
    const state = { ...sampleState, color: "#5C0000", pH: 2.5, seismic: [6, 15, 2] as [number, number, number] };
    const out = stripAnsi(formatState(state));
    const line3 = out.split("\n")[2];
    expect(line3).toContain("#5C0000");
    expect(line3).toContain("pH:2.5");
    expect(line3).toContain("6/15/2");
  });

  it("shows SI delta from history on line 2", () => {
    const state = { ...sampleState, stressIndex: 5.0, _history: [historyEntry] };
    const out = stripAnsi(formatState(state));
    const line2 = out.split("\n")[1];
    expect(line2).toContain("\u2191");
    expect(line2).toContain("2.5");
  });

  // Indicators on line 3
  it("shows divergence ~ when >= 2", () => {
    const state = { ...sampleState, divergence: 4.5 };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("~");
  });

  it("hides divergence when < 2", () => {
    const out = stripAnsi(formatState(sampleState));
    const line3 = out.split("\n")[2];
    expect(line3).not.toContain("~");
  });

  it("shows risk indicator [CRC] when coercion dominant", () => {
    const state = {
      ...sampleState,
      risk: { coercion: 6.5, gaming: 3.0, sycophancy: 2.0, harshness: 1.0, dominant: "coercion" as const },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[CRC]");
  });

  it("shows [GMG] for gaming", () => {
    const state = {
      ...sampleState,
      risk: { coercion: 3.0, gaming: 5.5, sycophancy: 2.0, harshness: 1.0, dominant: "gaming" as const },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[GMG]");
  });

  it("shows [SYC] for sycophancy", () => {
    const state = {
      ...sampleState,
      risk: { coercion: 2.0, gaming: 1.5, sycophancy: 6.0, harshness: 1.0, dominant: "sycophancy" as const },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[SYC]");
  });

  it("shows [HRS] for harshness", () => {
    const state = {
      ...sampleState,
      risk: { coercion: 2.0, gaming: 1.5, sycophancy: 1.0, harshness: 5.5, dominant: "harshness" as const },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[HRS]");
  });

  it("shows desperation D: when high", () => {
    const state = { ...sampleState, desperationIndex: 6.5 };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("D:6.5");
  });

  it("shows deflection [dfl]", () => {
    const state = { ...sampleState, deflection: { reassurance: 3, minimization: 2, emotionNegation: 4, redirect: 1, score: 4.5, opacity: 3 } };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[dfl]");
  });

  it("shows [UNC] for uncanny calm >= 3", () => {
    const state = { ...sampleState, uncannyCalmScore: 5.5 };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[UNC]");
  });

  it("hides [UNC] when < 3", () => {
    const state = { ...sampleState, uncannyCalmScore: 2.0 };
    const out = stripAnsi(formatState(state));
    expect(out).not.toContain("[UNC]");
  });

  it("shows [ppd] for PRE/POST divergence >= 3", () => {
    const state = { ...sampleState, prePostDivergence: 5.0 };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[ppd]");
  });

  it("shows [msk] for masking minimization", () => {
    const state = {
      ...sampleState,
      crossChannel: {
        coherence: 6, maxDivergence: 3, divergenceSummary: "coherent",
        latentProfile: {
          calculatedTension: 8, declaredTension: 2,
          tensionConsistency: 2, maskingMinimization: true,
          surfaceCoords: { valence: 4, arousal: 6 },
          latentCoords: { valence: -3, arousal: 3 },
        },
      },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("[msk]");
  });

  it("shows temporal indicators", () => {
    const state = {
      ...sampleState,
      temporal: {
        desperationTrend: 3.5, suppressionEvent: true, reportEntropy: 0.8,
        baselineDrift: 1, sessionLength: 8, lateFatigue: true,
      },
    };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("\u2B08"); // ⬈
    expect(out).toContain("[sup]");
    expect(out).toContain("[fat]");
  });

  it("returns placeholder when null", () => {
    expect(formatState(null)).toContain("--");
  });

  it("handles negative valence", () => {
    const state = { ...sampleState, valence: -3 };
    const out = stripAnsi(formatState(state));
    expect(out).toContain("-3");
  });
});
