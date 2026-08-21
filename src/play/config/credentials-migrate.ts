/**
 * One-shot migration of legacy play-cli credentials into bags-cli's
 * canonical `~/.config/bags/credentials.json`.
 *
 * Background:
 * - The standalone `@bagsfm/play-cli` (now demoted to internal dev tool)
 *   stored credentials at `env-paths("bags").config/credentials.json`,
 *   which is OS-dependent (e.g. `~/Library/Preferences/bags-nodejs/`
 *   on macOS).
 * - `@bagsfm/bags-cli` standardises on `~/.config/bags/` cross-platform.
 * - On the first `bags play <cmd>` invocation we transparently copy the
 *   legacy `apiKey` over so existing play-cli users do not have to log in
 *   again. The legacy file is left in place untouched (no destructive ops).
 *
 * The path math here is a small inline reimplementation of `env-paths`
 * to avoid pulling that dependency for a one-off migration. See
 * PLAY_INTEGRATION.md section 12.4.
 *
 * @packageDocumentation
 */

import { readFile } from "node:fs/promises";
import { homedir, platform } from "node:os";
import { join } from "node:path";
import chalk from "chalk";
import { getOrCreateAuthKeypair } from "../../lib/auth.js";
import { loadCliConfig } from "../../lib/config.js";
import {
	type BagsCredentials,
	loadCredentials,
	saveCredentials,
} from "../../lib/credentials.js";
import { BAGS_CREDENTIALS_PATH, BAGS_KEYPAIR_PATH } from "../../lib/paths.js";

const LEGACY_PACKAGE_SUFFIX = "bags-nodejs";
const LEGACY_CREDENTIAL_FILE = "credentials.json";

/**
 * Replicates `env-paths("bags", { suffix: "" }).config` without taking on
 * the `env-paths` dependency. The package appends a `-nodejs` suffix
 * automatically — hence `bags-nodejs`.
 *
 * - macOS: `~/Library/Preferences/bags-nodejs/`
 * - Windows: `%APPDATA%/bags-nodejs/Config/`
 * - Linux/BSD: `$XDG_CONFIG_HOME/bags-nodejs/` (or `~/.config/bags-nodejs/`)
 */
export const computeLegacyPlayConfigDir = (): string => {
	const home = homedir();
	const plat = platform();

	if (plat === "darwin") {
		return join(home, "Library", "Preferences", LEGACY_PACKAGE_SUFFIX);
	}
	if (plat === "win32") {
		const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
		return join(appData, LEGACY_PACKAGE_SUFFIX, "Config");
	}
	const xdg = process.env.XDG_CONFIG_HOME;
	return xdg
		? join(xdg, LEGACY_PACKAGE_SUFFIX)
		: join(home, ".config", LEGACY_PACKAGE_SUFFIX);
};

const fileExists = async (path: string): Promise<boolean> => {
	try {
		await readFile(path);
		return true;
	} catch {
		return false;
	}
};

interface LegacyCredentialPayload {
	apiKey?: unknown;
}

const isValidApiKey = (value: unknown): value is string => {
	return typeof value === "string" && value.startsWith("bags_prod_");
};

/**
 * Performs the legacy credential migration if applicable. Safe to call on
 * every Play subcommand entry — no-op when bags-cli credentials already
 * exist or no legacy file is present.
 *
 * Resolution flow:
 * 1. If `~/.config/bags/credentials.json` exists with a valid apiKey, return.
 * 2. Look up the legacy `env-paths("bags").config/credentials.json`. Return
 *    if it does not exist or its `apiKey` is malformed.
 * 3. Auto-create a keypair via the existing `getOrCreateAuthKeypair()` so
 *    `walletAddress` is populated (the bags-cli credentials schema requires
 *    it). This avoids a schema change to `BagsCredentials`.
 * 4. Save the migrated record at the new path; print a one-line notice.
 */
export const migrateLegacyPlayCredentials = async (): Promise<void> => {
	const existing = await loadCredentials();
	if (existing?.apiKey) {
		return;
	}

	const legacyPath = join(computeLegacyPlayConfigDir(), LEGACY_CREDENTIAL_FILE);
	if (!(await fileExists(legacyPath))) {
		return;
	}

	let parsed: LegacyCredentialPayload;
	try {
		parsed = JSON.parse(await readFile(legacyPath, "utf8"));
	} catch {
		return;
	}

	if (!isValidApiKey(parsed.apiKey)) {
		return;
	}

	const keypair = await getOrCreateAuthKeypair(BAGS_KEYPAIR_PATH);

	const credentials: BagsCredentials = {
		apiKey: parsed.apiKey,
		authMode: "manual",
		walletAddress: keypair.publicKey.toBase58(),
		authenticatedAt: new Date().toISOString(),
	};

	await saveCredentials(credentials);

	const cliConfig = await loadCliConfig();
	const isJsonMode =
		process.argv.includes("--json") || cliConfig.output === "json";
	const isQuiet =
		process.argv.includes("--quiet") || process.argv.includes("-q");
	if (!(isJsonMode || isQuiet)) {
		console.log(
			chalk.dim(
				`Migrated legacy play-cli credentials from ${legacyPath} to ${BAGS_CREDENTIALS_PATH}.`,
			),
		);
	}
};
