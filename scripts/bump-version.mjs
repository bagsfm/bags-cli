#!/usr/bin/env node
/**
 * Bump semver in package.json and package-lock.json (root).
 * CLI version is read from package.json at runtime (see src/version.ts).
 * Usage: node scripts/bump-version.mjs <patch|minor|major>
 */

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const BUMP_TYPES = new Set(["patch", "minor", "major"]);

function parseVersion(v) {
  const m = /^(\d+)\.(\d+)\.(\d+)$/.exec(v.trim());

  if (!m) {
    throw new Error(`Invalid semver: ${v} (expected MAJOR.MINOR.PATCH)`);
  }

  return { major: +m[1], minor: +m[2], patch: +m[3] };
}

function bumpVersion(current, type) {
  const { major, minor, patch } = parseVersion(current);
  if (type === "major") return `${major + 1}.0.0`;
  if (type === "minor") return `${major}.${minor + 1}.0`;
  return `${major}.${minor}.${patch + 1}`;
}

function main() {
  const type = process.argv[2];

  if (!type || !BUMP_TYPES.has(type)) {
    console.error(
      `Usage: node scripts/bump-version.mjs <patch|minor|major>\n` +
        `Example: npm run bump -- patch`
    );
    process.exit(1);
  }

  const pkgPath = join(root, "package.json");
  const lockPath = join(root, "package-lock.json");

  const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
  const oldVersion = pkg.version;
  
  if (!oldVersion) {
    console.error("package.json has no version field");
    process.exit(1);
  }

  const newVersion = bumpVersion(oldVersion, type);
  
  pkg.version = newVersion;
  
  writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const lock = JSON.parse(readFileSync(lockPath, "utf8"));
  
  lock.version = newVersion;
  
  if (lock.packages?.[""]) {
    lock.packages[""].version = newVersion;
  }

  writeFileSync(lockPath, `${JSON.stringify(lock, null, 2)}\n`);

  console.log(`Bumped ${oldVersion} → ${newVersion} (${type})`);
}

main();
