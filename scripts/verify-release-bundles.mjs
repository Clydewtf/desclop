import { readdirSync, statSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const bundleRoot = resolve(repositoryRoot, "apps/desktop/src-tauri/target/release/bundle");
const platform = process.env.RELEASE_PLATFORM;

const expectedBundles = {
  "macos-latest": [{ directory: "dmg", extension: ".dmg" }],
  "ubuntu-22.04": [
    { directory: "appimage", extension: ".appimage" },
    { directory: "deb", extension: ".deb" }
  ],
  "windows-latest": [{ directory: "nsis", extension: ".exe" }]
};

function filesIn(directory) {
  if (!statSafe(directory)?.isDirectory()) {
    return [];
  }

  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = join(directory, entry.name);
    return entry.isDirectory() ? filesIn(entryPath) : [entryPath];
  });
}

function statSafe(path) {
  try {
    return statSync(path);
  } catch {
    return null;
  }
}

if (!platform || !expectedBundles[platform]) {
  console.error(`Unsupported RELEASE_PLATFORM: ${platform ?? "missing"}`);
  process.exit(1);
}

if (!statSafe(bundleRoot)?.isDirectory()) {
  console.error(`Tauri bundle directory was not created: ${bundleRoot}`);
  process.exit(1);
}

const missing = [];
for (const expected of expectedBundles[platform]) {
  const directory = join(bundleRoot, expected.directory);
  const matchingFiles = filesIn(directory).filter(
    (path) => extname(path).toLowerCase() === expected.extension
  );
  if (!matchingFiles.length) {
    missing.push(`${expected.directory}/*${expected.extension}`);
  }
}

if (missing.length) {
  console.error(`Missing expected ${platform} bundle(s): ${missing.join(", ")}`);
  process.exit(1);
}

console.log(`Expected ${platform} release bundles were created in ${bundleRoot}.`);
