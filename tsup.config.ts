import { defineConfig } from "tsup";

export default defineConfig([
  {
    entry: { cli: "src/cli.ts" },
    format: ["esm"],
    target: "node20",
    clean: true,
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
  },
  {
    entry: { "emobar-hook": "src/hook.ts" },
    format: ["esm"],
    target: "node20",
    banner: { js: "#!/usr/bin/env node" },
    splitting: false,
  },
  {
    entry: { index: "src/index.ts" },
    format: ["esm"],
    target: "node20",
    dts: true,
    splitting: false,
  },
]);
