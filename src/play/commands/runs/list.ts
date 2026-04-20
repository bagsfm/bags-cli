import chalk from "chalk";
import type { Command } from "commander";
import { ApiError, callApi } from "../../api/client.js";
import { muted } from "../../utils/colors.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";
import { formatRunRow } from "./format.js";

interface ListRunsOptions {
	app?: string;
	limit?: string;
	status?: string;
}

export const registerListSubcommand = (parent: Command): void => {
	const command = parent
		.command("list")
		.description("List runs")
		.option("--app <appId>", "filter by App ID")
		.option(
			"--status <status>",
			"filter by status (pending, running, completed, failed, cancelled)",
		)
		.option("--limit <n>", "max results (default 20)")
		.action(
			wrapPlayAction(async (command, options: ListRunsOptions) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching runs...");
					const result = await callApi(client.api.v1.runs.$get, {
						query: {
							appId: options.app,
							limit: options.limit,
							status: options.status as
								| "cancelled"
								| "completed"
								| "failed"
								| "pending"
								| "running"
								| undefined,
						},
					});
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result);
						return;
					}

					if (result.items.length === 0) {
						console.log(muted("  No runs found."));
						return;
					}

					console.log(chalk.bold(`\n  Runs (${result.items.length})\n`));
					console.log(
						muted(
							`  ${"ID".padEnd(14)} ${"App".padEnd(16)} ${"Status".padEnd(12)} ${"Duration".padEnd(10)} Started`,
						),
					);
					for (const run of result.items) {
						console.log(formatRunRow(run));
					}
					console.log();
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
					});
				}
			}),
		);

	addExamplesAfter(command, [
		{ description: "List all runs", command: "bags play runs list" },
		{
			description: "Filter by App and status",
			command: "bags play runs list --app my-app --status failed",
		},
		{
			description: "Output as JSON",
			command: "bags play runs list --json",
		},
	]);
};
