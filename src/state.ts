import fs from "node:fs";
import path from "node:path";
import type { EmoBarState } from "./types.js";
import { MAX_HISTORY_ENTRIES } from "./types.js";
import { toHistoryEntry } from "./temporal.js";

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

    // Backwards compat: still populate _previous for one release cycle
    const { _previous: _, _history: __, ...clean } = previous;
    if (!clean.risk) {
      clean.risk = { coercion: 0, gaming: 0, sycophancy: 0, harshness: 0, dominant: "none" };
    }
    state._previous = clean as EmoBarState;
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
