import type { Command } from "commander";
import { promptConfirm } from "../../../lib/prompt.js";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { assertForceForJsonMutation } from "../../utils/confirmation.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";

interface DeleteSecretOptions {
	force?: boolean;
}

const confirmSecretDeletion = async (
	secretId: string,
	force: boolean | undefined,
	json: boolean,
): Promise<void> => {
	if (force) {
		return;
	}

	assertForceForJsonMutation({
		actionLabel: "delete without confirmation",
		commandExample: "bags play secrets delete <secretId> --force --json",
		force,
		json,
	});

	const confirmed = await promptConfirm(
		`Delete secret ${secretId}? This cannot be undone.`,
		false,
	);
	if (!confirmed) {
		process.exit(0);
	}
};

export const registerDeleteSubcommand = (parent: Command): void => {
	const command = parent
		.command("delete <secretId>")
		.description("Delete a secret")
		.option("--force", "Skip confirmation")
		.action(
			wrapPlayAction(
				async (command, secretId: string, options: DeleteSecretOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command);
					const spinner = createSpinner(ui);
					await confirmSecretDeletion(secretId, options.force, ui.json);

					try {
						spinner.start("Deleting secret...");
						await callApi(client.api.v1.secrets[":secretId"].$delete, {
							param: { secretId },
						});
						spinner.stop("Secret deleted.");

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
		{ command: "bags play secrets delete sec_abc123" },
		{
			description: "Skip confirmation",
			command: "bags play secrets delete sec_abc123 --force",
		},
	]);
};
