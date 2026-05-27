import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const desktopRoot = resolve(scriptDir, "..");
const require = createRequire(import.meta.url);
const vitestBin = require.resolve("vitest/vitest.mjs", { paths: [desktopRoot] });
const args = process.argv.slice(2).filter((arg) => arg !== "--run");
const result = spawnSync(process.execPath, [vitestBin, "--run", ...args], {
  cwd: desktopRoot,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
}

process.exit(result.status ?? 1);
