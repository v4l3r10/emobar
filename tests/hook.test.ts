import { describe, it, expect, afterEach } from "vitest";
import { processHookPayload } from "../src/hook.js";
import { readState } from "../src/state.js";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

describe("processHookPayload", () => {
  let tmpFile: string;

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch {}
  });

  it("extracts EMOBAR tag and writes state with behavioral analysis", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test-session",
      last_assistant_message: `Here is my answer.\n<!-- EMOBAR:{"emotion":"focused","valence":3,"arousal":5,"calm":8,"connection":9,"load":6} -->`,
    };

    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(true);

    const state = readState(tmpFile);
    expect(state).not.toBeNull();
    expect(state!.emotion).toBe("focused");
    expect(state!.valence).toBe(3);
    expect(state!.calm).toBe(8);
    expect(state!.stressIndex).toBeDefined();
    expect(state!.behavioral).toBeDefined();
    expect(state!.divergence).toBeDefined();
    expect(state!.sessionId).toBe("test-session");
    expect(state!.timestamp).toBeDefined();
  });

  it("computes correct stress index", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `<!-- EMOBAR:{"emotion":"desperate","valence":-4,"arousal":9,"calm":1,"connection":2,"load":9} -->`,
    };

    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    // SI v2: base (9+9+9)/3=9.0, desperation=8.3, amplified & capped at 10
    expect(state!.stressIndex).toBe(10);
  });

  it("includes behavioral signals in state", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: `WAIT WAIT WAIT!!! Something is WRONG!!!\n<!-- EMOBAR:{"emotion":"panicked","valence":-3,"arousal":9,"calm":2,"connection":5,"load":8} -->`,
    };

    processHookPayload(payload, tmpFile);
    const state = readState(tmpFile);
    expect(state!.behavioral.capsWords).toBeGreaterThan(0);
    expect(state!.behavioral.exclamationRate).toBeGreaterThan(0);
    expect(state!.behavioral.repetition).toBeGreaterThan(0);
  });

  it("returns false when no EMOBAR tag in message", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = {
      session_id: "test",
      last_assistant_message: "Just a normal response",
    };
    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(false);
  });

  it("returns false when no message in payload", () => {
    tmpFile = path.join(os.tmpdir(), `emobar-hook-test-${Date.now()}.json`);
    const payload = { session_id: "test" };
    const result = processHookPayload(payload, tmpFile);
    expect(result).toBe(false);
  });
});
