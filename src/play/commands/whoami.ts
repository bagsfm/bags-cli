/**
 * `bags play whoami` — show authenticated Play user identity.
 *
 * Calls Play API `/auth/me` against the currently stored Bags developer
 * key. Distinct from `bags auth status`, which only inspects the local
 * credentials file and never makes a network call.
 *
 * Per locked decision D1, Play commands surface a friendly error when the
 * stored key does not have the `bags_prod_` prefix. The hint message points
 * users at `bags auth login --auth-mode manual` (the `bags play login`
 * subcommand was intentionally not ported — see plan section "Decisions
 * confirmed during planning").
 *
 * @packageDocumentation
 */

import chalk from "chalk";
import type { Command } from "commander";
import {
	maskApiKey,
	validateApiKey,
	validateApiKeyFormat,
} from "../api/auth.js";
import {
	ApiError,
	createPlayClient,
	resolveApiClientConfig,
	resolveApiKey,
} from "../api/client.js";
import {
	accent,
	highlight,
	label,
	sectionHeader,
	url,
} from "../utils/colors.js";
import { addExamplesAfter } from "../utils/help.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { showError } from "../utils/output.js";

interface WhoamiOptions {
	bagsApi?: string;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
}

const formatWhoamiMessage = (
	userId: string,
	keyName: string | null,
	apiKeyMasked: string,
): string => {
	const lines = [
		sectionHeader("Authenticated as:"),
		`  ${label("User ID:")}   ${chalk.bold(userId)}`,
	];

	if (keyName) {
		lines.push(`  ${label("Key:")}       ${accent(keyName)}`);
	}

	lines.push(`  ${label("API key:")}   ${highlight(apiKeyMasked)}`);
	return lines.join("\n");
};

const NOT_AUTHENTICATED_MESSAGE = "Not authenticated.";
const NOT_AUTHENTICATED_HINT =
	"Run `bags auth login --auth-mode manual --api-key <bags_prod_…>` to authenticate.";

const INVALID_FORMAT_MESSAGE =
	"Stored Bags API key is not compatible with Play.";
const INVALID_FORMAT_HINT = `Run \`bags auth login --auth-mode manual --api-key <bags_prod_…>\` with a Play-compatible key. Get one at ${url("https://dev.bags.fm")}`;

const REVOKED_MESSAGE = "Stored API key is invalid or revoked.";
const REVOKED_HINT =
	"Run `bags auth login --auth-mode manual --api-key <bags_prod_…>` to authenticate again.";

const SERVICE_UNAVAILABLE_MESSAGE =
	"Authentication service is temporarily unavailable.";
const SERVICE_UNAVAILABLE_HINT = "Try again in a few moments.";

const NO_PLAY_ACCOUNT_HINT = `Your key is valid for Bags but not linked to a Play account. Visit ${url("https://dev.bags.fm")} to provision Play access.`;

const handleWhoamiError = (error: unknown): void => {
	if (error instanceof ApiError) {
		if (error.status === 401) {
			showError(REVOKED_MESSAGE, { suggestion: REVOKED_HINT });
			return;
		}
		if (error.status === 404) {
			showError("No Play user linked to this API key.", {
				suggestion: NO_PLAY_ACCOUNT_HINT,
			});
			return;
		}
		if (error.status === 503) {
			showError(SERVICE_UNAVAILABLE_MESSAGE, {
				suggestion: SERVICE_UNAVAILABLE_HINT,
			});
			return;
		}
	}

	const message =
		error instanceof Error
			? error.message
			: "Failed to validate stored API key against Play.";

	showError(message, {
		suggestion: REVOKED_HINT,
	});
};

/**
 * Executes the whoami flow against the Play API.
 */
export const executeWhoami = async (options: WhoamiOptions): Promise<void> => {
	const apiKey = await resolveApiKey();

	if (!apiKey) {
		showError(NOT_AUTHENTICATED_MESSAGE, {
			suggestion: NOT_AUTHENTICATED_HINT,
		});
		return;
	}

	if (!validateApiKeyFormat(apiKey)) {
		showError(INVALID_FORMAT_MESSAGE, { suggestion: INVALID_FORMAT_HINT });
		return;
	}

	try {
		const config = await resolveApiClientConfig({
			apiKey,
			bagsApiUrl: options.bagsApi,
			playApiUrl: options.playApi,
		});
		const client = createPlayClient(config);
		const user = await validateApiKey(client, apiKey);

		if (options.json) {
			writeJsonSuccess({
				apiKey: maskApiKey(apiKey),
				keyName: user.keyName,
				userId: user.userId,
			});
			return;
		}

		if (!options.quiet) {
			console.log(
				formatWhoamiMessage(user.userId, user.keyName, maskApiKey(apiKey)),
			);
		}
	} catch (error) {
		handleWhoamiError(error);
	}
};

/** Registers `bags play whoami`. */
export const registerWhoamiCommand = (parent: Command): void => {
	const command = parent
		.command("whoami")
		.description("Show authenticated Play user (calls Play /auth/me)")
		.action(async function (this: Command) {
			await executeWhoami(this.optsWithGlobals<WhoamiOptions>());
		});

	addExamplesAfter(command, [{ command: "bags play whoami" }]);
};
