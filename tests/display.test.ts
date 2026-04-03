import { describe, it, expect } from "vitest";
import { formatState, formatCompact, formatMinimal, stripAnsi } from "../src/display.js";
import type { EmoBarState } from "../src/types.js";

const sampleState: EmoBarState = {
  load: 4, certainty: 7, connection: 10, energy: 9, friction: 0,
  keyword: "flow", stressIndex: 1.6,
  timestamp: "2026-04-03T22:00:00Z", sessionId: "abc",
};

describe("display", () => {
  it("formatState produces full format with all dimensions", () => {
    const out = stripAnsi(formatState(sampleState));
    expect(out).toContain("L:4");
    expect(out).toContain("C:7");
    expect(out).toContain("K:10");
    expect(out).toContain("E:9");
    expect(out).toContain("F:0");
    expect(out).toContain("flow");
    expect(out).toContain("1.6");
  });

  it("formatCompact produces short format", () => {
    const out = stripAnsi(formatCompact(sampleState));
    expect(out).toContain("L4");
    expect(out).toContain("flow");
    expect(out).toContain("1.6");
  });

  it("formatMinimal produces just SI and keyword", () => {
    const out = stripAnsi(formatMinimal(sampleState));
    expect(out).toContain("1.6");
    expect(out).toContain("flow");
  });

  it("returns placeholder when state is null", () => {
    const out = formatState(null);
    expect(out).toContain("--");
  });
});
