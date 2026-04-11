import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const pkgPath = join(dirname(fileURLToPath(import.meta.url)), "..", "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as { version?: string };

if (!pkg.version || typeof pkg.version !== "string") {
  throw new Error(`Missing version in ${pkgPath}`);
}

export const cliVersion = pkg.version;
