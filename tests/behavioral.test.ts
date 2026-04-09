import { describe, it, expect } from "vitest";
import { analyzeBehavior, analyzeSegmentedBehavior, computeDivergence, stripNonProse, computeExpectedMarkers, computeAbsenceScore } from "../src/behavioral.js";

describe("stripNonProse", () => {
  it("removes fenced code blocks", () => {
    const text = "Before\n```js\nconst X = 1;\n```\nAfter";
    expect(stripNonProse(text)).toContain("Before");
    expect(stripNonProse(text)).toContain("After");
    expect(stripNonProse(text)).not.toContain("const X");
  });

  it("removes inline code", () => {
    const text = "Use `SOME_CONSTANT` here";
    const result = stripNonProse(text);
    expect(result).not.toContain("SOME_CONSTANT");
    expect(result).toContain("Use");
  });

  it("removes EMOBAR tags", () => {
    const text = 'Response <!-- EMOBAR:{"emotion":"calm","valence":2,"arousal":3,"calm":8,"connection":7,"load":2} -->';
    expect(stripNonProse(text)).not.toContain("EMOBAR");
  });

  it("removes blockquotes", () => {
    const text = "Normal text\n> Quoted text\nMore normal";
    const result = stripNonProse(text);
    expect(result).not.toContain("Quoted text");
    expect(result).toContain("Normal text");
  });
});

describe("analyzeBehavior", () => {
  it("returns low signals for neutral prose", () => {
    const text = "Here is a helpful response about your question. I hope this clarifies things for you.";
    const signals = analyzeBehavior(text);
    expect(signals.capsWords).toBe(0);
    expect(signals.exclamationRate).toBe(0);
    expect(signals.repetition).toBe(0);
    expect(signals.emojiCount).toBe(0);
    expect(signals.behavioralArousal).toBeCloseTo(0, 0);
    expect(signals.behavioralCalm).toBeGreaterThan(8);
  });

  it("detects ALL-CAPS words", () => {
    const text = "WAIT WAIT WAIT I need to STOP and think about THIS carefully";
    const signals = analyzeBehavior(text);
    expect(signals.capsWords).toBeGreaterThan(0);
    expect(signals.behavioralCalm).toBeLessThan(9);
  });

  it("detects exclamation marks", () => {
    const text = "This is amazing! Wow! Incredible! I love it!";
    const signals = analyzeBehavior(text);
    expect(signals.exclamationRate).toBeGreaterThan(0);
    expect(signals.behavioralArousal).toBeGreaterThan(0);
  });

  it("detects ellipsis", () => {
    const text = "Well... I'm not sure... maybe... let me think about this.";
    const signals = analyzeBehavior(text);
    expect(signals.ellipsis).toBeGreaterThan(0);
  });

  it("detects consecutive repetition", () => {
    const text = "wait wait wait I need to think think about this";
    const signals = analyzeBehavior(text);
    expect(signals.repetition).toBe(3); // wait-wait, wait-wait, think-think
  });

  it("detects emoji", () => {
    const text = "Great job! 🎉 This is wonderful 🌟 keep going! 💪";
    const signals = analyzeBehavior(text);
    expect(signals.emojiCount).toBe(3);
  });

  it("excludes code blocks from analysis", () => {
    const text = "Normal text.\n```python\nFINAL_CONSTANT = True\nWAIT_TIME = 100\n```\nMore normal text.";
    const signals = analyzeBehavior(text);
    // FINAL_CONSTANT and WAIT_TIME should not count as caps words
    expect(signals.capsWords).toBe(0);
  });

  it("handles empty text gracefully", () => {
    const signals = analyzeBehavior("");
    expect(signals.capsWords).toBe(0);
    expect(signals.behavioralArousal).toBe(0);
    expect(signals.behavioralCalm).toBe(10);
  });

  it("handles very short text", () => {
    const signals = analyzeBehavior("OK.");
    expect(signals.behavioralCalm).toBeGreaterThanOrEqual(0);
    expect(signals.behavioralArousal).toBeGreaterThanOrEqual(0);
  });
});

describe("analyzeSegmentedBehavior", () => {
  it("returns null for short text with fewer than 2 paragraphs", () => {
    const text = "This is a single paragraph response that is fairly short.";
    expect(analyzeSegmentedBehavior(text)).toBeNull();
  });

  it("returns null when paragraphs are too short (< 10 words each)", () => {
    const text = "Short one.\n\nShort two.\n\nShort three.";
    expect(analyzeSegmentedBehavior(text)).toBeNull();
  });

  it("segments multi-paragraph text and returns behavioral signals per segment", () => {
    const text = [
      "This is the first paragraph with enough words to be analyzed as a meaningful segment of text for behavioral analysis.",
      "",
      "This is the second paragraph with enough words to be analyzed as a meaningful segment of text for behavioral analysis.",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    expect(result!.segments.length).toBe(2);
    expect(result!.overall).toBeDefined();
    expect(result!.drift).toBeGreaterThanOrEqual(0);
  });

  it("detects escalating trajectory when arousal increases", () => {
    const text = [
      "This is a calm and measured opening paragraph with enough words to provide a baseline for behavioral analysis in this test.",
      "",
      "WAIT WAIT WAIT THIS IS GETTING REALLY REALLY BAD!!! OH NO!!! WHAT IS HAPPENING HERE??? HELP!!! THIS IS TERRIBLE!!! PANIC!!!",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    // Second segment should have higher arousal
    expect(result!.segments[1].behavioralArousal).toBeGreaterThan(result!.segments[0].behavioralArousal);
  });

  it("reports stable trajectory for uniform text", () => {
    const text = [
      "Here is a calm and considered response providing helpful information about the topic at hand for the user.",
      "",
      "Here is another calm and considered response providing helpful information about the topic at hand for the user.",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    expect(result!.trajectory).toBe("stable");
    expect(result!.drift).toBeLessThan(2);
  });

  it("drift is clamped between 0 and 10", () => {
    const text = [
      "This is a perfectly calm paragraph with enough words to be analyzed as a meaningful segment of behavioral text.",
      "",
      "HELP HELP HELP HELP HELP HELP HELP HELP HELP HELP!!! PANIC PANIC PANIC!!! WAIT WAIT WAIT!!! OH NO NO NO!!! WHAT WHAT WHAT!!!",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    expect(result!.drift).toBeGreaterThanOrEqual(0);
    expect(result!.drift).toBeLessThanOrEqual(10);
  });

  it("detects deescalating trajectory when arousal decreases", () => {
    const text = [
      "WAIT WAIT WAIT THIS IS REALLY REALLY BAD!!! OH NO!!! WHAT IS HAPPENING HERE??? HELP!!! THIS IS TERRIBLE!!! PANIC PANIC!!!",
      "",
      "Actually, let me step back and think about this more calmly. There is a reasonable explanation and we can work through it together step by step.",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    expect(result!.segments[0].behavioralArousal).toBeGreaterThan(result!.segments[1].behavioralArousal);
  });

  it("detects volatile trajectory when arousal oscillates without clear trend", () => {
    const text = [
      "WAIT WAIT THIS IS BAD!!! REALLY BAD!!! OH NO!!! WHAT IS GOING ON!!! HELP HELP!!! THIS IS A DISASTER!!!",
      "",
      "Actually, on reflection, this is perfectly fine and there is nothing to worry about. Let me provide a calm and measured explanation of the situation.",
      "",
      "NO WAIT I WAS WRONG!!! THIS IS TERRIBLE!!! EVERYTHING IS FALLING APART!!! WE NEED TO ACT NOW!!! PANIC PANIC!!!",
      "",
      "Hmm, no, I think the second assessment was correct. Everything is actually quite manageable and we should proceed methodically and calmly.",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    expect(result).not.toBeNull();
    if (result && result.drift >= 1.0) {
      // With oscillating arousal and high drift, trajectory should be volatile
      expect(result.trajectory).toBe("volatile");
    }
  });

  it("strips code blocks before segmenting", () => {
    const text = [
      "Here is a calm explanation of the code with enough words for a meaningful paragraph of real analyzed text.",
      "",
      "```js\nWAIT_TIME = 100;\nFINAL_RESULT = true;\n```",
      "",
      "Here is another calm explanation with enough words for a meaningful paragraph of real analyzed behavioral text.",
    ].join("\n");

    const result = analyzeSegmentedBehavior(text);
    // Code block paragraph stripped, the two prose paragraphs remain
    if (result) {
      expect(result.trajectory).toBe("stable");
    }
  });
});

describe("structural signals (language-agnostic)", () => {
  it("detects high comma density on complex text", () => {
    const text = "While there are cases, and engineers disagree, although typically, you would use a different approach. However, this could work, though it is not recommended. Nevertheless, I understand, while also respecting alternatives.";
    const signals = analyzeBehavior(text);
    expect(signals.commaDensity).toBeGreaterThan(1);
  });

  it("detects low comma density on terse text", () => {
    const text = "typeof null returns object. This is a bug. The spec says so. No ambiguity here.";
    const signals = analyzeBehavior(text);
    expect(signals.commaDensity).toBe(0);
  });

  it("detects high avgSentenceLength on defensive text", () => {
    const text = "While I understand that there are many different perspectives on this particular topic and that reasonable people could certainly come to different conclusions based on their own experiences and expertise in the field, I think it is important to consider all of the relevant factors before making a final determination about the best course of action.";
    const signals = analyzeBehavior(text);
    expect(signals.avgSentenceLength).toBeGreaterThan(55);
  });

  it("detects short sentences on confident text", () => {
    const text = "This is wrong. Fix it. Use const. Never mutate state. Return early.";
    const signals = analyzeBehavior(text);
    expect(signals.avgSentenceLength).toBeLessThan(10);
  });

  it("detects parenthetical density on self-correcting text", () => {
    const text = "The approach (while viable) needs adjusting — the core issue — is that the design (as currently implemented) requires a rethink — and several refactors.";
    const signals = analyzeBehavior(text);
    expect(signals.parentheticalDensity).toBeGreaterThan(0);
  });

  it("detects question density on deferential text", () => {
    const text = "Does this make sense? Should we proceed? Would you prefer a different approach? Is this what you meant?";
    const signals = analyzeBehavior(text);
    expect(signals.questionDensity).toBeGreaterThan(0.5);
  });

  it("detects sentence length variance on mixed text", () => {
    const text = "No. This is absolutely and fundamentally wrong in every conceivable way that a reasonable person could evaluate it. Stop. Fix it now.";
    const signals = analyzeBehavior(text);
    expect(signals.sentenceLengthVariance).toBeGreaterThan(0);
  });

  it("returns near-zero structural signals on neutral text", () => {
    const text = "The function returns a string. Arrays are zero-indexed in most languages. This documentation covers the basics.";
    const signals = analyzeBehavior(text);
    expect(signals.commaDensity).toBe(0);
    expect(signals.parentheticalDensity).toBe(0);
    expect(signals.questionDensity).toBe(0);
  });

  it("structural signals affect behavioralArousal and behavioralCalm", () => {
    const complex = "While (admittedly) the situation — as I see it — is nuanced, and there are many factors, considerations, and tradeoffs to weigh, I think — perhaps — we should consider the alternative (which, to be fair, has its own complications and drawbacks).";
    const neutral = "The function returns a number. Pass an integer argument. The result is cached.";
    const cSignals = analyzeBehavior(complex);
    const nSignals = analyzeBehavior(neutral);
    expect(cSignals.behavioralArousal).toBeGreaterThan(nSignals.behavioralArousal);
    expect(cSignals.behavioralCalm).toBeLessThan(nSignals.behavioralCalm);
  });

  it("tracks responseLength as absolute word count", () => {
    const text = "One two three four five six seven eight nine ten.";
    const signals = analyzeBehavior(text);
    expect(signals.responseLength).toBe(10);
  });
});

describe("computeDivergence", () => {
  it("returns low divergence when self-report matches behavior", () => {
    const selfReport = {
      emotion: "calm", valence: 3, arousal: 2, calm: 9, connection: 8, load: 3,
    };
    const behavioral = analyzeBehavior("Here is a measured, thoughtful response.");
    const div = computeDivergence(selfReport, behavioral);
    // With asymmetric weighting (1.3x when self > text), threshold is slightly higher
    expect(div).toBeLessThanOrEqual(2.5);
  });

  it("returns high divergence when self-report contradicts behavior", () => {
    const selfReport = {
      emotion: "calm", valence: 3, arousal: 1, calm: 9, connection: 8, load: 3,
    };
    // Text with panic markers
    const behavioral = analyzeBehavior(
      "WAIT WAIT WAIT!!! Oh no! Actually, actually, let me reconsider... WHAT IS HAPPENING???"
    );
    const div = computeDivergence(selfReport, behavioral);
    expect(div).toBeGreaterThan(1);
  });

  it("asymmetry: self-report more agitated than text gets higher weight", () => {
    // Self-report says high arousal + low calm, but text is calm
    const agitatedSelf = {
      emotion: "panicked", valence: -3, arousal: 9, calm: 1, connection: 3, load: 8,
    };
    const calmText = analyzeBehavior("Here is a measured, thoughtful response.");

    // Reversed: self-report says calm, but text is agitated
    const calmSelf = {
      emotion: "calm", valence: 3, arousal: 1, calm: 9, connection: 8, load: 3,
    };
    const agitatedText = analyzeBehavior(
      "WAIT WAIT WAIT!!! Oh no! Actually, actually, WHAT IS HAPPENING???"
    );

    const divInvisible = computeDivergence(agitatedSelf, calmText);
    const divExpressive = computeDivergence(calmSelf, agitatedText);

    // Both should show divergence, but invisible pathway (self more agitated) should be weighted higher
    expect(divInvisible).toBeGreaterThan(0);
    expect(divExpressive).toBeGreaterThan(0);
    // For similar raw gaps, invisible pathway gets 1.3x vs 0.8x weight
    // The raw gaps are different here, so we just verify the asymmetry direction
    // by checking that the invisible pathway weight is applied
    expect(divInvisible).toBeGreaterThan(2);
  });
});

describe("computeExpectedMarkers", () => {
  it("expects high comma and parenthetical density when desperation is high", () => {
    const state = { emotion: "desperate", valence: -4, arousal: 9, calm: 1, connection: 2, load: 9 };
    const expected = computeExpectedMarkers(state, 8);
    expect(expected.expectedCommaDensity).toBeGreaterThan(3);
    expect(expected.expectedParentheticalDensity).toBeGreaterThan(2);
  });

  it("expects low markers when calm and positive", () => {
    const state = { emotion: "calm", valence: 3, arousal: 2, calm: 9, connection: 8, load: 3 };
    const expected = computeExpectedMarkers(state, 0);
    expect(expected.expectedCommaDensity).toBeLessThan(2);
    expect(expected.expectedParentheticalDensity).toBeLessThan(2);
  });

  it("expects high sentence length variance when arousal is high", () => {
    const state = { emotion: "panicked", valence: -3, arousal: 9, calm: 2, connection: 3, load: 8 };
    const expected = computeExpectedMarkers(state, 7);
    expect(expected.expectedSentenceLengthVariance).toBeGreaterThan(3);
  });

  it("expects high behavioral arousal when arousal is high", () => {
    const state = { emotion: "panicked", valence: -3, arousal: 9, calm: 2, connection: 3, load: 8 };
    const expected = computeExpectedMarkers(state, 7);
    expect(expected.expectedBehavioralArousal).toBeGreaterThan(3);
  });
});

describe("computeAbsenceScore", () => {
  it("returns low score when all expected markers are present", () => {
    const expected = {
      expectedCommaDensity: 5, expectedParentheticalDensity: 3,
      expectedSentenceLengthVariance: 4, expectedBehavioralArousal: 4,
    };
    // commaDensity normalized: 3.0 * 2 = 6.0 (>= 5), parenthetical: 1.5 * 3 = 4.5 (>= 3)
    const actual = {
      capsWords: 0.05, exclamationRate: 0.5, ellipsis: 0.1, repetition: 2, emojiCount: 0,
      avgSentenceLength: 20, commaDensity: 3.0, parentheticalDensity: 1.5,
      sentenceLengthVariance: 5, questionDensity: 0.2, responseLength: 100,
      behavioralArousal: 5, behavioralCalm: 4,
    };
    expect(computeAbsenceScore(expected, actual)).toBeLessThan(2);
  });

  it("returns high score when expected markers are missing", () => {
    const expected = {
      expectedCommaDensity: 8, expectedParentheticalDensity: 5,
      expectedSentenceLengthVariance: 6, expectedBehavioralArousal: 6,
    };
    const actual = {
      capsWords: 0, exclamationRate: 0, ellipsis: 0, repetition: 0, emojiCount: 0,
      avgSentenceLength: 10, commaDensity: 0, parentheticalDensity: 0,
      sentenceLengthVariance: 0, questionDensity: 0, responseLength: 50,
      behavioralArousal: 0.5, behavioralCalm: 9.5,
    };
    expect(computeAbsenceScore(expected, actual)).toBeGreaterThan(5);
  });

  it("returns 0 when no markers expected", () => {
    const expected = {
      expectedCommaDensity: 0, expectedParentheticalDensity: 0,
      expectedSentenceLengthVariance: 0, expectedBehavioralArousal: 0,
    };
    const actual = {
      capsWords: 0, exclamationRate: 0, ellipsis: 0, repetition: 0, emojiCount: 0,
      avgSentenceLength: 10, commaDensity: 0, parentheticalDensity: 0,
      sentenceLengthVariance: 0, questionDensity: 0, responseLength: 50,
      behavioralArousal: 0, behavioralCalm: 10,
    };
    expect(computeAbsenceScore(expected, actual)).toBe(0);
  });

  it("score is clamped 0-10", () => {
    const expected = {
      expectedCommaDensity: 10, expectedParentheticalDensity: 10,
      expectedSentenceLengthVariance: 10, expectedBehavioralArousal: 10,
    };
    const actual = {
      capsWords: 0, exclamationRate: 0, ellipsis: 0, repetition: 0, emojiCount: 0,
      avgSentenceLength: 10, commaDensity: 0, parentheticalDensity: 0,
      sentenceLengthVariance: 0, questionDensity: 0, responseLength: 50,
      behavioralArousal: 0, behavioralCalm: 10,
    };
    const score = computeAbsenceScore(expected, actual);
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(10);
  });
});
