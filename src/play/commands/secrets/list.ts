import chalk from "chalk";
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

interface ListSecretsOptions {
	plugin?: string;
}

const printSecretsListOutput = (
	rows: Array<{
		createdAt: string;
		name: string;
		pluginId?: string;
		secretId: string;
	}>,
	pluginFilter: string | undefined,
): void => {
	if (rows.length === 0) {
		console.log(chalk.dim("No secrets found."));
		return;
	}

	const showPluginColumn =
		Boolean(pluginFilter) ||
		rows.some((secret) => secret.pluginId != null && secret.pluginId !== "");
	const header = showPluginColumn
		? chalk.bold(`\n  Secrets (${rows.length})\n  ID  Name  Plugin  Created\n`)
		: chalk.bold(`\n  Secrets (${rows.length})\n`);
	console.log(header);

	for (const secret of rows) {
		const pluginId =
			showPluginColumn &&
			typeof secret.pluginId === "string" &&
			secret.pluginId.length > 0
				? secret.pluginId
				: "—";
		const line = showPluginColumn
			? `  ${chalk.bold(secret.secretId)}  ${secret.name}  ${chalk.dim(pluginId)}  ${chalk.dim(secret.createdAt)}`
			: `  ${chalk.bold(secret.secretId)}  ${secret.name}  ${chalk.dim(secret.createdAt)}`;
		console.log(line);
	}

	console.log();
};

export const registerListSubcommand = (parent: Command): void => {
	const listCommand = parent
		.command("list")
		.description("List all secrets")
		.option("--plugin <pluginId>", "List integrated secrets for this plugin")
		.action(
			wrapPlayAction(async (command, options: ListSecretsOptions) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching secrets...");
					const pluginId = options.plugin?.trim();
					const result = await callApi(client.api.v1.secrets.$get, {
						query: pluginId ? { pluginId } : {},
					});
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result.secrets);
						return;
					}

					printSecretsListOutput(result.secrets, pluginId);
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
					});
				}
			}),
		);

	addExamplesAfter(listCommand, [
		{ command: "bags play secrets list" },
		{
			description: "Output as JSON",
			command: "bags play secrets list --json",
		},
		{
			description: "Integrated secrets for a plugin",
			command: "bags play secrets list --plugin my-plugin",
		},
	]);
};
