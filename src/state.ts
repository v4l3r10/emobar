import fs from "node:fs";
import path from "node:path";
import type { EmoBarState } from "./types.js";
import { MAX_HISTORY_ENTRIES, sessionStateFile } from "./types.js";
import { toHistoryEntry } from "./temporal.js";

/**
 * Resolve which state file to read for a display invocation.
 *
 * Claude Code pipes a JSON payload with `session_id` on stdin to statusline
 * commands. Returns the per-session state file path, or null when stdin has
 * no usable session_id — callers should render an empty state in that case
 * rather than reading some other session's file.
 *
 * Pure function so it's easy to unit-test without faking stdin.
 */
export function resolveStateFilePath(stdinInput: string | null): string | null {
  if (!stdinInput) return null;
  try {
    const parsed = JSON.parse(stdinInput);
    if (typeof parsed?.session_id === "string" && parsed.session_id.length > 0) {
      return sessionStateFile(parsed.session_id);
    }
  } catch {
    // Malformed stdin — no session context available.
  }
  return null;
}

export function writeState(state: EmoBarState, filePath: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const previous = readState(filePath);
  if (previous) {
    // Build ring buffer: previous history + previous state as new entry
    const prevHistory = previous._history ?? [];
    const prevEntry = toHistoryEntry(previous);
    const newHistory = [...prevHistory, prevEntry];

    // Trim to max size (keep most recent)
    if (newHistory.length > MAX_HISTORY_ENTRIES) {
      newHistory.splice(0, newHistory.length - MAX_HISTORY_ENTRIES);
    }

    state._history = newHistory;
  }

  fs.writeFileSync(filePath, JSON.stringify(state, null, 2));
}

export function readState(filePath: string): EmoBarState | null {
  try {
    const raw = fs.readFileSync(filePath, "utf-8");
    return JSON.parse(raw) as EmoBarState;
  } catch {
    return null;
  }
}
