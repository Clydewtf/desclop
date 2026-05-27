import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const vitestBin = resolve(desktopRoot, "../../node_modules/vitest/vitest.mjs");
const args = process.argv.slice(2).filter((arg) => arg !== "--run");
const result = spawnSync(process.execPath, [vitestBin, "--run", ...args], {
  cwd: desktopRoot,
  stdio: "inherit"
});

process.exit(result.status ?? 1);
