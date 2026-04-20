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

interface UpdateSecretOptions {
	name?: string;
	value?: string;
}

interface SecretUpdateRequest {
	name?: string;
	value?: string;
}

const hasText = (value: string | undefined): value is string =>
	typeof value === "string" && value.trim().length > 0;

export const buildSecretUpdateRequest = ({
	json = false,
	name,
	value,
}: UpdateSecretOptions & { json?: boolean }): SecretUpdateRequest => {
	const normalizedName = hasText(name) ? name.trim() : undefined;
	const hasValue = hasText(value);

	if (!normalizedName && !hasValue) {
		throw new PlayCommandError(
			json
				? "JSON mode requires `--name` or `--value` for secrets update."
				: "Provide `--name` or `--value` to update the secret.",
			{
				suggestion: json
					? "Run `bags play secrets update SECRET_ID --name NEW_NAME --json` or pass `--value ...`."
					: "Pass `--name`, `--value`, or omit `--value` to be prompted.",
			},
		);
	}

	return {
		...(normalizedName ? { name: normalizedName } : {}),
		...(hasValue ? { value } : {}),
	};
};

const resolveSecretUpdateValue = async (
	options: UpdateSecretOptions,
	json: boolean,
): Promise<string | undefined> => {
	if (hasText(options.value)) {
		return options.value;
	}

	if (json) {
		return undefined;
	}

	const promptedValue = await promptSecret("Enter new secret value:");
	if (!promptedValue) {
		process.exit(0);
	}

	return promptedValue;
};

export const registerUpdateSubcommand = (parent: Command): void => {
	const command = parent
		.command("update <secretId>")
		.description("Update a secret")
		.option("--name <newName>", "Rename the secret")
		.option("--value <value>", "new secret value (required in --json mode)")
		.action(
			wrapPlayAction(
				async (command, secretId: string, options: UpdateSecretOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command);
					const spinner = createSpinner(ui);
					const nextValue = await resolveSecretUpdateValue(options, ui.json);
					const request = buildSecretUpdateRequest({
						json: ui.json,
						name: options.name,
						value: nextValue,
					});

					try {
						spinner.start("Updating secret...");
						await callApi(client.api.v1.secrets[":secretId"].$put, {
							param: { secretId },
							json: request,
						});
						spinner.stop("Secret updated.");

						if (ui.json) {
							writeJsonSuccess({ secretId });
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
		{ command: "bags play secrets update sec_abc123" },
		{
			description: "Rename and update value",
			command: "bags play secrets update sec_abc123 --name NEW_NAME",
		},
	]);
};
