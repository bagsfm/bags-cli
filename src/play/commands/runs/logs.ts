import type { Command } from "commander";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";
import { formatLogEntries } from "./format.js";

interface LogsOptions {
	compact?: boolean;
	node?: string;
	type?: string;
	verbose?: boolean;
}

type LogDisplayMode = "compact" | "timeline" | "verbose";

const resolveDisplayMode = (options: LogsOptions): LogDisplayMode => {
	if (options.verbose) {
		return "verbose";
	}

	if (options.compact) {
		return "compact";
	}

	return "timeline";
};

export const registerLogsSubcommand = (parent: Command): void => {
	const command = parent
		.command("logs <runId>")
		.description("Show execution logs for a run")
		.option(
			"--type <type>",
			"filter by log type (node_start, node_complete, node_error, plugin)",
		)
		.option("--node <nodeId>", "filter by node ID")
		.option("--compact", "condensed single-line output")
		.option("--verbose", "expanded output with full data payloads")
		.action(
			wrapPlayAction(async (command, runId: string, options: LogsOptions) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching logs...");
					const result = await callApi(client.api.v1.runs[":runId"].logs.$get, {
						param: { runId },
						query: {
							nodeId: options.node,
							type: options.type as
								| "node_complete"
								| "node_error"
								| "node_start"
								| "plugin"
								| undefined,
						},
					});
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result);
						return;
					}

					console.log();
					console.log(
						formatLogEntries(runId, result.items, resolveDisplayMode(options)),
					);
					console.log();
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
						suggestion: "Check the run ID and try again.",
					});
				}
			}),
		);

	addExamplesAfter(command, [
		{ command: "bags play runs logs run_abc123" },
		{
			description: "Compact view",
			command: "bags play runs logs run_abc123 --compact",
		},
		{
			description: "Filter by node",
			command: "bags play runs logs run_abc123 --node action_1 --verbose",
		},
	]);
};
