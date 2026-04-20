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
import { formatDeploymentRow } from "./format.js";

interface ListDeploymentsOptions {
	app?: string;
	limit?: string;
	status?: string;
	tokenMint?: string;
}

export const registerListSubcommand = (parent: Command): void => {
	const command = parent
		.command("list")
		.description("List deployments")
		.option("--app <appId>", "filter by App ID")
		.option("--status <status>", "filter by status (pending, active, paused)")
		.option("--token-mint <mint>", "filter by token mint")
		.option("--limit <n>", "max results (default 20)")
		.action(
			wrapPlayAction(async (command, options: ListDeploymentsOptions) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching deployments...");
					const result = await callApi(client.api.v1.deployments.$get, {
						query: {
							appId: options.app,
							limit: options.limit,
							status: options.status as
								| "active"
								| "paused"
								| "pending"
								| undefined,
							tokenMint: options.tokenMint,
						},
					});
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result);
						return;
					}

					if (result.items.length === 0) {
						console.log(muted("  No deployments found."));
						return;
					}

					console.log(chalk.bold(`\n  Deployments (${result.items.length})\n`));
					console.log(
						muted(
							`  ${"ID".padEnd(14)} ${"App".padEnd(24)} ${"Status".padEnd(10)} ${"Schedule".padEnd(16)} Next Run`,
						),
					);
					for (const deployment of result.items) {
						console.log(formatDeploymentRow(deployment));
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
		{
			description: "List all deployments",
			command: "bags play deployments list",
		},
		{
			description: "Filter by status",
			command: "bags play deployments list --status active",
		},
		{
			description: "Filter by App and output JSON",
			command: "bags play deployments list --app my-app --json",
		},
	]);
};
