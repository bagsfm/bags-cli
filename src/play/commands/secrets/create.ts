import type { Command } from "commander";
import { promptSecret } from "../../../lib/prompt.js";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { PlayCommandError } from "../../utils/errors.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";

interface CreateSecretOptions {
	plugin?: string;
	value?: string;
}

const getSecretValue = async (
	value: string | undefined,
	json: boolean,
): Promise<string> => {
	if (typeof value === "string" && value !== "") {
		if (json && value.trim().length === 0) {
			throw new PlayCommandError(
				"JSON mode requires `--value <value>` for the secret.",
				{
					suggestion: "Run `bags play secrets create NAME --value ... --json`.",
				},
			);
		}

		return value;
	}

	if (json) {
		throw new PlayCommandError(
			"JSON mode requires `--value <value>` for the secret.",
			{
				suggestion: "Run `bags play secrets create NAME --value ... --json`.",
			},
		);
	}

	const promptedValue = await promptSecret("Enter secret value:");
	if (!promptedValue) {
		process.exit(0);
	}

	return promptedValue;
};

export const registerCreateSubcommand = (parent: Command): void => {
	const command = parent
		.command("create <name>")
		.description("Create a new secret")
		.option(
			"--plugin <pluginId>",
			"Store as an integrated secret for this plugin",
		)
		.option("--value <value>", "secret value (required in --json mode)")
		.action(
			wrapPlayAction(
				async (command, name: string, options: CreateSecretOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command);
					const spinner = createSpinner(ui);
					const secretValue = await getSecretValue(options.value, ui.json);
					const pluginId = options.plugin?.trim();

					try {
						spinner.start("Creating secret...");
						const result = await callApi(client.api.v1.secrets.$post, {
							json: {
								name,
								value: secretValue,
								...(pluginId ? { pluginId } : {}),
							},
						});
						spinner.stop(
							pluginId
								? `Integrated secret created: ${result.secretId} (plugin ${pluginId})`
								: `Secret created: ${result.secretId}`,
						);

						if (ui.json) {
							writeJsonSuccess({ secretId: result.secretId });
						}
					} catch (error) {
						spinner.stop();
						showError(
							error instanceof ApiError ? error.message : String(error),
							{
								json: ui.json,
							},
						);
					}
				},
			),
		);

	addExamplesAfter(command, [
		{ command: "bags play secrets create MY_API_KEY" },
		{
			description: "Integrated secret for a plugin",
			command: "bags play secrets create PARTNER_TOKEN --plugin my-plugin",
		},
	]);
};
