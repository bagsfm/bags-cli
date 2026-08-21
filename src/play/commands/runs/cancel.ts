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

interface CancelOptions {
	force?: boolean;
}

const confirmCancellation = async (
	runId: string,
	force: boolean | undefined,
	json: boolean,
): Promise<void> => {
	assertForceForJsonMutation({
		actionLabel: "cancel without confirmation",
		commandExample: "bags play runs cancel run_abc123 --force --json",
		force,
		json,
	});

	if (force) {
		return;
	}

	const confirmed = await promptConfirm(`Cancel run ${runId}?`, false);
	if (!confirmed) {
		process.exit(0);
	}
};

export const registerCancelSubcommand = (parent: Command): void => {
	const command = parent
		.command("cancel <runId>")
		.description("Cancel a pending or running run")
		.option("--force", "skip confirmation")
		.action(
			wrapPlayAction(async (command, runId: string, options: CancelOptions) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);
				await confirmCancellation(runId, options.force, ui.json);

				try {
					spinner.start("Cancelling run...");
					const result = await callApi(
						client.api.v1.runs[":runId"].cancel.$post,
						{
							param: { runId },
							json: {},
						},
					);
					spinner.stop(`Run ${result.runId} -> ${result.status}`);

					if (ui.json) {
						writeJsonSuccess({ runId: result.runId, status: result.status });
					}
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
						suggestion:
							error instanceof ApiError
								? "Only pending or running runs can be cancelled."
								: undefined,
					});
				}
			}),
		);

	addExamplesAfter(command, [
		{ command: "bags play runs cancel run_abc123" },
		{
			description: "Skip confirmation",
			command: "bags play runs cancel run_abc123 --force",
		},
	]);
};
