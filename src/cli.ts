import { setup, uninstall } from "./setup.js";
import { formatState, formatCompact, formatMinimal } from "./display.js";
import { readState } from "./state.js";
import { STATE_FILE, CLAUDE_MD_PATH, SETTINGS_PATH, HOOK_SCRIPT_PATH } from "./types.js";
import fs from "node:fs";

const command = process.argv[2];

switch (command) {
  case "setup":
    setup();
    break;

  case "uninstall":
    uninstall();
    break;

  case "display": {
    const format = process.argv[3] || "full";
    const state = readState(STATE_FILE);
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
    const state = readState(STATE_FILE);
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

    if (state) {
      console.log(`\n  Last check-in: ${state.timestamp}`);
      console.log(`  State: ${formatState(state)}`);
    } else {
      console.log("\n  No emotional state recorded yet.");
    }
    break;
  }

  default:
    console.log(`EmoBar v0.1.0 - Emotional status bar for Claude Code\n`);
    console.log("Commands:");
    console.log("  npx emobar setup      Configure EmoBar (hook + CLAUDE.md)");
    console.log("  npx emobar display    Output emotional state (for statuslines)");
    console.log("  npx emobar status     Show current configuration");
    console.log("  npx emobar uninstall  Remove all EmoBar configuration");
    console.log("\nDisplay formats:");
    console.log("  npx emobar display          Full format");
    console.log("  npx emobar display compact  Compact format");
    console.log("  npx emobar display minimal  Minimal (SI + keyword)");
}
