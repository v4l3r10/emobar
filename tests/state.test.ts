import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { writeState, readState, resolveStateFilePath } from "../src/state.js";
import { sessionStateFile } from "../src/types.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("state", () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `emobar-test-${Date.now()}.json`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it("writes and reads back state", () => {
    const state = {
      emotion: "focused", valence: 3, arousal: 5, calm: 8, connection: 9, load: 6,
      stressIndex: 2.3, desperationIndex: 0,
      behavioral: {
        capsWords: 0, exclamationRate: 0, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 10,
        commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
        questionDensity: 0, responseLength: 100,
        behavioralArousal: 0.5, behavioralCalm: 9.5,
      },
      divergence: 0.8,
      risk: { coercion: 1.0, sycophancy: 3.0, harshness: 0.5, dominant: "none" as const },
      timestamp: "2026-04-04T10:00:00Z", sessionId: "abc",
    };
    writeState(state, tmpFile);
    const read = readState(tmpFile);
    expect(read).toEqual(state);
  });

  it("preserves previous state on consecutive writes", () => {
    const first = {
      emotion: "calm", valence: 3, arousal: 2, calm: 9, connection: 8, load: 3,
      stressIndex: 1.3, desperationIndex: 0,
      behavioral: {
        capsWords: 0, exclamationRate: 0, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 10,
        commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
        questionDensity: 0, responseLength: 100,
        behavioralArousal: 0, behavioralCalm: 10,
      },
      divergence: 0,
      risk: { coercion: 0.5, sycophancy: 2.0, harshness: 0.5, dominant: "none" as const },
      timestamp: "2026-04-04T10:00:00Z",
    };
    const second = {
      emotion: "stressed", valence: -2, arousal: 8, calm: 3, connection: 5, load: 8,
      stressIndex: 7.0, desperationIndex: 3.5,
      behavioral: {
        capsWords: 0.1, exclamationRate: 0.5, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 15,
        commaDensity: 2.0, parentheticalDensity: 1.0, sentenceLengthVariance: 3.0,
        questionDensity: 0.5, responseLength: 150,
        behavioralArousal: 4.5, behavioralCalm: 6.0,
      },
      divergence: 2.1,
      risk: { coercion: 5.5, sycophancy: 0.8, harshness: 2.0, dominant: "coercion" as const },
      timestamp: "2026-04-04T10:01:00Z",
    };

    writeState(first, tmpFile);
    writeState(second, tmpFile);
    const read = readState(tmpFile);

    // Previous state should be last entry in history
    expect(read!._history).toBeDefined();
    expect(read!._history!.length).toBe(1);
    expect(read!._history![0].emotion).toBe("calm");
    expect(read!._history![0].stressIndex).toBe(1.3);
  });

  it("returns null for missing file", () => {
    const read = readState("/tmp/nonexistent-emobar.json");
    expect(read).toBeNull();
  });

  it("returns null for corrupted file", () => {
    fs.writeFileSync(tmpFile, "not json");
    const read = readState(tmpFile);
    expect(read).toBeNull();
  });

  it("builds _history ring buffer across writes", () => {
    const makeState = (emotion: string, si: number) => ({
      emotion, valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
      stressIndex: si, desperationIndex: 0,
      behavioral: {
        capsWords: 0, exclamationRate: 0, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 10,
        commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
        questionDensity: 0, responseLength: 100,
        behavioralArousal: 0, behavioralCalm: 10,
      },
      divergence: 0,
      risk: { coercion: 0, sycophancy: 0, harshness: 0, dominant: "none" as const },
      timestamp: new Date().toISOString(),
    });

    writeState(makeState("first", 1), tmpFile);
    writeState(makeState("second", 2), tmpFile);
    writeState(makeState("third", 3), tmpFile);
    writeState(makeState("fourth", 4), tmpFile);

    const read = readState(tmpFile);
    expect(read!._history).toBeDefined();
    expect(read!._history!.length).toBe(3);
    expect(read!._history![0].emotion).toBe("first");
    expect(read!._history![2].emotion).toBe("third");
  });

  it("caps _history at MAX_HISTORY_ENTRIES", () => {
    const makeState = (emotion: string, si: number) => ({
      emotion, valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
      stressIndex: si, desperationIndex: 0,
      behavioral: {
        capsWords: 0, exclamationRate: 0, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 10,
        commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
        questionDensity: 0, responseLength: 100,
        behavioralArousal: 0, behavioralCalm: 10,
      },
      divergence: 0,
      risk: { coercion: 0, sycophancy: 0, harshness: 0, dominant: "none" as const },
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < 25; i++) {
      writeState(makeState(`entry-${i}`, i), tmpFile);
    }

    const read = readState(tmpFile);
    expect(read!._history!.length).toBeLessThanOrEqual(20);
    expect(read!._history![read!._history!.length - 1].emotion).toBe("entry-23");
  });

  it("_history entries do not contain nested _history or behavioral", () => {
    const makeState = (emotion: string, si: number) => ({
      emotion, valence: 0, arousal: 5, calm: 5, connection: 5, load: 5,
      stressIndex: si, desperationIndex: 0,
      behavioral: {
        capsWords: 0, exclamationRate: 0, ellipsis: 0,
        repetition: 0, emojiCount: 0, avgSentenceLength: 10,
        commaDensity: 0, parentheticalDensity: 0, sentenceLengthVariance: 0,
        questionDensity: 0, responseLength: 100,
        behavioralArousal: 0, behavioralCalm: 10,
      },
      divergence: 0,
      risk: { coercion: 0, sycophancy: 0, harshness: 0, dominant: "none" as const },
      timestamp: new Date().toISOString(),
    });

    for (let i = 0; i < 5; i++) {
      writeState(makeState(`e${i}`, i), tmpFile);
    }

    const read = readState(tmpFile);
    for (const entry of read!._history!) {
      expect((entry as Record<string, unknown>)._history).toBeUndefined();
      expect((entry as Record<string, unknown>).behavioral).toBeUndefined();
    }
  });
});

describe("sessionStateFile", () => {
  it("builds a per-session path inside STATE_DIR", () => {
    const p = sessionStateFile("abc-123_XYZ");
    expect(p).toMatch(/emobar-state\/abc-123_XYZ\.json$/);
  });

  it("sanitizes path traversal attempts", () => {
    const p = sessionStateFile("../../etc/passwd");
    // All non [A-Za-z0-9_-] chars become underscores → no ../ remains
    expect(p).not.toContain("..");
    expect(p).not.toContain("/etc/");
    expect(p).toMatch(/emobar-state\/[a-zA-Z0-9_-]+\.json$/);
  });

  it("produces distinct paths for distinct sessions", () => {
    expect(sessionStateFile("a")).not.toBe(sessionStateFile("b"));
  });
});

describe("resolveStateFilePath", () => {
  it("returns null when stdin is null", () => {
    expect(resolveStateFilePath(null)).toBeNull();
  });

  it("returns null when stdin is empty", () => {
    expect(resolveStateFilePath("")).toBeNull();
  });

  it("returns null when stdin is malformed JSON", () => {
    expect(resolveStateFilePath("not json")).toBeNull();
  });

  it("returns null when session_id is missing", () => {
    expect(resolveStateFilePath(JSON.stringify({ cwd: "/" }))).toBeNull();
  });

  it("returns per-session path when stdin has session_id", () => {
    const input = JSON.stringify({ session_id: "abc-123", cwd: "/" });
    expect(resolveStateFilePath(input)).toBe(sessionStateFile("abc-123"));
  });

  it("returns null for non-string session_id", () => {
    expect(resolveStateFilePath(JSON.stringify({ session_id: 42 }))).toBeNull();
  });

  it("returns null for empty session_id", () => {
    expect(resolveStateFilePath(JSON.stringify({ session_id: "" }))).toBeNull();
  });
});
