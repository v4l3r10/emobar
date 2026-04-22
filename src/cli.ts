import { setup, uninstall } from "./setup.js";
import { formatState, formatCompact, formatMinimal } from "./display.js";
import { readState, resolveStateFilePath } from "./state.js";
import { STATE_DIR, CLAUDE_MD_PATH, SETTINGS_PATH, HOOK_SCRIPT_PATH } from "./types.js";
import fs from "node:fs";
import path from "node:path";

async function readStdinIfPiped(): Promise<string | null> {
  // Claude Code pipes JSON on stdin when invoking statusline commands.
  // When a user runs `npx emobar display` in a real terminal, stdin is a TTY
  // and we skip the read.
  if (process.stdin.isTTY) return null;
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin) chunks.push(chunk);
    const input = Buffer.concat(chunks).toString("utf-8").trim();
    return input.length > 0 ? input : null;
  } catch {
    return null;
  }
}

/** Return all per-session state files sorted by mtime, most recent first. */
function listSessionStateFiles(): { path: string; mtimeMs: number }[] {
  if (!fs.existsSync(STATE_DIR)) return [];
  let names: string[];
  try {
    names = fs.readdirSync(STATE_DIR);
  } catch {
    return [];
  }
  const out: { path: string; mtimeMs: number }[] = [];
  for (const name of names) {
    if (!name.endsWith(".json")) continue;
    const full = path.join(STATE_DIR, name);
    // throwIfNoEntry: false → returns undefined instead of throwing if the
    // file was deleted between readdirSync and statSync. Skip that one file
    // rather than losing visibility into every session.
    const st = fs.statSync(full, { throwIfNoEntry: false });
    if (st) out.push({ path: full, mtimeMs: st.mtimeMs });
  }
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

async function main(): Promise<void> {
  const command = process.argv[2];

  switch (command) {
    case "setup": {
      const displayFormat = process.argv[3] || "full";
      setup(displayFormat);
      break;
    }

    case "uninstall":
      uninstall();
      break;

    case "display": {
      const format = process.argv[3] || "full";
      const stdinInput = await readStdinIfPiped();
      const stateFile = resolveStateFilePath(stdinInput);
      const state = stateFile ? readState(stateFile) : null;
      switch (format) {
        case "compact":
          process.stdout.write(formatCompact(state));
          break;
        case "minimal":
          process.stdout.write(formatMinimal(state));
          break;
        default:
          process.stdout.write(formatState(state));
      }
      break;
    }

    case "status": {
      const claudeMdExists = fs.existsSync(CLAUDE_MD_PATH);
      let claudeMdHasEmobar = false;
      try {
        const content = fs.readFileSync(CLAUDE_MD_PATH, "utf-8");
        claudeMdHasEmobar = content.includes("EMOBAR:START");
      } catch {}
      const hookExists = fs.existsSync(HOOK_SCRIPT_PATH);
      let hookConfigured = false;
      try {
        const settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, "utf-8"));
        hookConfigured = settings.hooks?.Stop?.some(
          (e: any) => e.hooks?.some((h: any) => h.command?.includes("emobar"))
        ) ?? false;
      } catch {}

      console.log("EmoBar Status");
      console.log("=============\n");
      console.log(`  CLAUDE.md instruction: ${claudeMdHasEmobar ? "installed" : "missing"}`);
      console.log(`  Hook script:          ${hookExists ? "installed" : "missing"}`);
      console.log(`  Hook configured:      ${hookConfigured ? "yes" : "no"}`);

      const sessionFiles = listSessionStateFiles();
      console.log(`  Active sessions:      ${sessionFiles.length}`);

      if (sessionFiles.length > 0) {
        const mostRecent = readState(sessionFiles[0].path);
        if (mostRecent) {
          console.log(`\n  Most recent check-in: ${mostRecent.timestamp}`);
          console.log(`  State: ${formatState(mostRecent)}`);
        }
      } else {
        console.log("\n  No emotional state recorded yet.");
      }
      break;
    }

    default:
      console.log(`EmoBar v2.3.0 - Emotional status bar for Claude Code\n`);
      console.log("Commands:");
      console.log("  npx emobar setup [format]  Configure EmoBar (hook + CLAUDE.md + statusline)");
      console.log("  npx emobar display [format]  Output emotional state (for statuslines)");
      console.log("  npx emobar status          Show current configuration");
      console.log("  npx emobar uninstall       Remove all EmoBar configuration");
      console.log("\nFormats: full (default), compact, minimal");
  }
}

main().catch(() => process.exit(1));
