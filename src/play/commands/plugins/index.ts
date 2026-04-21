import chalk from "chalk";
import type { Command } from "commander";
import { ApiError, callApi, type PlayApiClient } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { formatLamportsAsSol, truncateAddress } from "../../utils/format.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";

const formatActionFeeLine = (fee: {
	readonly lamports?: string;
	readonly treasury: string;
	readonly type: "dynamic" | "fixed";
}): string => {
	const treasury = truncateAddress(fee.treasury, 6);
	if (fee.type === "fixed") {
		return `${formatLamportsAsSol(fee.lamports ?? "0")} -> ${treasury}`;
	}

	return `dynamic (runtime) -> ${treasury}`;
};

const printPluginsList = (
	plugins: Array<{
		actions?: Array<{ fee?: unknown }>;
		category: string;
		id: string;
		name: string;
	}>,
): void => {
	console.log(chalk.bold(`\n  Plugins (${plugins.length})\n`));
	for (const plugin of plugins) {
		const actionCount = plugin.actions?.length ?? 0;
		const paidCount = (plugin.actions ?? []).filter(
			(action) => action.fee != null,
		).length;
		const paidLabel =
			paidCount > 0 ? chalk.yellow(`${paidCount} paid`) : chalk.dim("—");

		console.log(
			`  ${chalk.bold(plugin.id)}  ${plugin.name}  ${chalk.dim(plugin.category)}  ${chalk.dim(`${actionCount} actions`)}  ${paidLabel}`,
		);
	}
	console.log();
};

interface RegisterPluginUiState {
	readonly json: boolean;
	readonly quiet: boolean;
}

interface RegisterPluginDependencies {
	createSpinner?: typeof createSpinner;
	getClient?: () => Promise<PlayApiClient>;
	logger?: { info(message: string): void };
	showError?: typeof showError;
	writeJsonSuccess?: typeof writeJsonSuccess;
}

const defaultRegisterPluginLogger = {
	info(message: string) {
		console.log(message);
	},
};

export const executeRegisterPlugin = async (
	packageName: string,
	ui: RegisterPluginUiState,
	{
		createSpinner: createSpinnerImpl = createSpinner,
		getClient,
		logger = defaultRegisterPluginLogger,
		showError: showErrorImpl = showError,
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: RegisterPluginDependencies,
): Promise<void> => {
	if (!getClient) {
		throw new Error("Missing Play client factory for plugin registration.");
	}

	const spinner = createSpinnerImpl(ui);

	try {
		spinner.start(`Registering ${packageName}...`);
		const client = await getClient();
		const result = await callApi(client.api.v1.admin.plugins.register.$post, {
			json: { packageName },
		});
		spinner.stop();

		if (ui.json) {
			writeJsonSuccessImpl(result);
			return;
		}

		logger.info(
			`\n  Plugin registered: ${result.pluginId} v${result.version}\n`,
		);
		if (result.previousVersion) {
			logger.info(`  Updated from v${result.previousVersion}`);
		}
		logger.info("");
	} catch (error) {
		spinner.stop();
		showErrorImpl(error instanceof ApiError ? error.message : String(error), {
			json: ui.json,
		});
	}
};

export const registerPluginsCommand = (parent: Command): void => {
	const plugins = parent.command("plugins").description("Inspect Play plugins");

	const listCommand = plugins
		.command("list")
		.description("List available plugins")
		.action(
			wrapPlayAction(async (command) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching plugins...");
					const result = await callApi(client.api.v1.plugins.$get);
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result.plugins);
						return;
					}

					if (result.plugins.length === 0) {
						console.log(chalk.dim("No plugins found."));
						return;
					}

					printPluginsList(result.plugins);
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
					});
				}
			}),
		);

	addExamplesAfter(listCommand, [
		{ command: "bags play plugins list" },
		{
			description: "Output as JSON",
			command: "bags play plugins list --json",
		},
	]);

	const infoCommand = plugins
		.command("info <pluginId>")
		.description("Show plugin details")
		.action(
			wrapPlayAction(async (command, pluginId: string) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching plugin info...");
					const result = await callApi(
						client.api.v1.plugins[":pluginId"].$get,
						{
							param: { pluginId },
						},
					);
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result);
						return;
					}

					console.log(chalk.bold(`\n  ${result.name} (${result.id})\n`));
					if (result.description) {
						console.log(`  ${result.description}\n`);
					}

					console.log(`  Category: ${result.category}`);

					if (result.actions && result.actions.length > 0) {
						console.log(
							chalk.bold(`\n  Actions (${result.actions.length}):\n`),
						);
						for (const action of result.actions) {
							console.log(`    ${chalk.bold(action.id)}  ${action.name}`);
							if (action.description) {
								console.log(`    ${chalk.dim(action.description)}`);
							}
							if (action.fee) {
								console.log(
									`    ${chalk.dim("Paid:")} ${formatActionFeeLine(action.fee)}`,
								);
							}
						}
					}

					if (
						result.integratedSecrets &&
						Object.keys(result.integratedSecrets).length > 0
					) {
						console.log(chalk.bold("\n  Integrated secrets:\n"));
						for (const [field, meta] of Object.entries(
							result.integratedSecrets as Record<
								string,
								{ overridable: boolean; secretId: string }
							>,
						)) {
							const policy = meta.overridable ? "overridable" : "locked";
							console.log(
								`    ${chalk.bold(field)}  ${chalk.dim(meta.secretId)}  ${chalk.dim(policy)}`,
							);
						}
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

	addExamplesAfter(infoCommand, [
		{ command: "bags play plugins info bags-api" },
		{
			description: "Output as JSON",
			command: "bags play plugins info bags-api --json",
		},
	]);

	const registerCommand = plugins
		.command("register <packageName>")
		.description("Register a plugin package [admin]")
		.action(
			wrapPlayAction(async (command, packageName: string) => {
				const ui = await resolvePlayCommandUiState(command);
				await executeRegisterPlugin(packageName, ui, {
					getClient: async () =>
						await getPlayClientForCommand(command, { requireAdmin: true }),
				});
			}),
		);

	addExamplesAfter(registerCommand, [
		{
			command: "bags play plugins register @bagsfm/play-bags-plugin",
		},
	]);

	addExamplesAfter(plugins, [
		{
			description: "Browse available plugins",
			command: "bags play plugins list",
		},
		{
			description: "View plugin actions",
			command: "bags play plugins info bags-api",
		},
		{
			description: "Register a plugin package [admin]",
			command: "bags play plugins register @bagsfm/play-bags-plugin",
		},
	]);
};
