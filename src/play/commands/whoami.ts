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
	assertPlayApiAccess,
	maskApiKey,
	validateApiKey,
} from "../api/auth.js";
import {
	ApiError,
	createPlayClient,
	resolveApiClientConfig,
} from "../api/client.js";
import {
	accent,
	highlight,
	label,
	sectionHeader,
	url,
} from "../utils/colors.js";
import { resolvePlayCommandUiState } from "../utils/command.js";
import { getPlayCommandErrorDetails } from "../utils/errors.js";
import { addExamplesAfter } from "../utils/help.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { showError } from "../utils/output.js";

interface WhoamiOptions {
	bagsApi?: string;
	playApi?: string;
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

const REVOKED_MESSAGE = "Stored API key is invalid or revoked.";
const REVOKED_HINT =
	"Run `bags auth login --auth-mode manual --api-key <bags_prod_…>` to authenticate again.";

const SERVICE_UNAVAILABLE_MESSAGE =
	"Authentication service is temporarily unavailable.";
const SERVICE_UNAVAILABLE_HINT = "Try again in a few moments.";

const NO_PLAY_ACCOUNT_HINT = `Your key is valid for Bags but not linked to a Play account. Visit ${url("https://dev.bags.fm")} to provision Play access.`;

const handleWhoamiError = (error: unknown, json: boolean): void => {
	if (error instanceof ApiError) {
		if (error.status === 401) {
			showError(REVOKED_MESSAGE, { json, suggestion: REVOKED_HINT });
			return;
		}
		if (error.status === 404) {
			showError("No Play user linked to this API key.", {
				json,
				suggestion: NO_PLAY_ACCOUNT_HINT,
			});
			return;
		}
		if (error.status === 503) {
			showError(SERVICE_UNAVAILABLE_MESSAGE, {
				json,
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
		json,
		suggestion: REVOKED_HINT,
	});
};

/**
 * Executes the whoami flow against the Play API.
 */
export const executeWhoami = async (
	options: WhoamiOptions,
	ui: { json: boolean; quiet: boolean },
): Promise<void> => {
	try {
		const config = await resolveApiClientConfig({
			bagsApiUrl: options.bagsApi,
			playApiUrl: options.playApi,
		});
		const access = assertPlayApiAccess({
			apiKey: config.apiKey,
		});
		const apiKey = access.apiKey;
		const client = createPlayClient({
			...config,
			apiKey,
		});
		const user = await validateApiKey(client, apiKey);

		if (ui.json) {
			writeJsonSuccess({
				apiKey: maskApiKey(apiKey),
				keyName: user.keyName,
				userId: user.userId,
			});
			return;
		}

		if (!ui.quiet) {
			console.log(
				formatWhoamiMessage(user.userId, user.keyName, maskApiKey(apiKey)),
			);
		}
	} catch (error) {
		const details = getPlayCommandErrorDetails(error);
		if (!(error instanceof ApiError)) {
			showError(details.message, {
				exitCode: details.exitCode,
				json: ui.json,
				suggestion: details.suggestion,
			});
			return;
		}
		handleWhoamiError(error, ui.json);
	}
};

/** Registers `bags play whoami`. */
export const registerWhoamiCommand = (parent: Command): void => {
	const command = parent
		.command("whoami")
		.description("Show authenticated Play user (calls Play /auth/me)")
		.action(async function (this: Command) {
			const ui = await resolvePlayCommandUiState(this);
			await executeWhoami(this.optsWithGlobals<WhoamiOptions>(), ui);
		});

	addExamplesAfter(command, [{ command: "bags play whoami" }]);
};
