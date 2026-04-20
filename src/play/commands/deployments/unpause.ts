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

interface UnpauseOptions {
	force?: boolean;
	token?: string;
}

const confirmUnpause = async (
	deploymentId: string,
	force: boolean | undefined,
	json: boolean,
): Promise<void> => {
	assertForceForJsonMutation({
		actionLabel: "unpause without confirmation",
		commandExample: "bags play deployments unpause dep_abc123 --force --json",
		force,
		json,
	});

	if (force) {
		return;
	}

	const confirmed = await promptConfirm(
		`Unpause deployment ${deploymentId}?`,
		false,
	);
	if (!confirmed) {
		process.exit(0);
	}
};

export const registerUnpauseSubcommand = (parent: Command): void => {
	const command = parent
		.command("unpause <deploymentId>")
		.description("Unpause a paused deployment [admin]")
		.option("--force", "skip confirmation")
		.option("--token <token>", "admin token (overrides BAGS_PLAY_ADMIN_TOKEN)")
		.action(
			wrapPlayAction(
				async (command, deploymentId: string, options: UnpauseOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command, {
						adminToken: options.token,
						requireAdmin: true,
					});
					const spinner = createSpinner(ui);
					await confirmUnpause(deploymentId, options.force, ui.json);

					try {
						spinner.start("Unpausing deployment...");
						await callApi(
							client.api.v1.admin.deployments[":deploymentId"].unpause.$post,
							{
								param: { deploymentId },
							},
						);
						spinner.stop(`Deployment ${deploymentId} unpaused.`);

						if (ui.json) {
							writeJsonSuccess({ deploymentId });
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
		{ command: "bags play deployments unpause dep_abc123" },
		{
			description: "Skip confirmation",
			command: "bags play deployments unpause dep_abc123 --force",
		},
	]);
};
