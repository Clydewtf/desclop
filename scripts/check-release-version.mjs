import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");

function readJson(relativePath) {
  return JSON.parse(readFileSync(resolve(repositoryRoot, relativePath), "utf8"));
}

function readCargoPackageVersion() {
  const cargoToml = readFileSync(
    resolve(repositoryRoot, "apps/desktop/src-tauri/Cargo.toml"),
    "utf8"
  );
  const packageSection = cargoToml.match(/\[package\]([\s\S]*?)(?=\n\[|$)/)?.[1] ?? "";
  return packageSection.match(/^version\s*=\s*"([^"]+)"\s*$/m)?.[1] ?? null;
}

const packageJson = readJson("apps/desktop/package.json");
const tauriConfig = readJson("apps/desktop/src-tauri/tauri.conf.json");
const packageLock = readJson("package-lock.json");
const versions = {
  "apps/desktop/package.json": packageJson.version,
  "apps/desktop/src-tauri/Cargo.toml": readCargoPackageVersion(),
  "apps/desktop/src-tauri/tauri.conf.json": tauriConfig.version,
  "package-lock.json workspace": packageLock.packages?.["apps/desktop"]?.version ?? null
};

const missing = Object.entries(versions).filter(([, version]) => !version);
if (missing.length) {
  console.error(`Missing release version in: ${missing.map(([path]) => path).join(", ")}`);
  process.exit(1);
}

const uniqueVersions = [...new Set(Object.values(versions))];
if (uniqueVersions.length !== 1) {
  console.error("Release version mismatch:");
  for (const [path, version] of Object.entries(versions)) {
    console.error(`- ${path}: ${version}`);
  }
  process.exit(1);
}

const releaseTag = process.env.RELEASE_TAG?.trim();
if (releaseTag && releaseTag !== `v${uniqueVersions[0]}`) {
  console.error(`Release tag ${releaseTag} does not match version ${uniqueVersions[0]}.`);
  process.exit(1);
}

console.log(`Release version ${uniqueVersions[0]} is consistent${releaseTag ? ` with ${releaseTag}` : ""}.`);
