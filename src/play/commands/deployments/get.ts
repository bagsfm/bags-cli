import type { Command } from "commander";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError, showWarning } from "../../utils/output.js";
import { formatDeploymentDetails } from "./format.js";

interface GetDeploymentOptions {
	runs?: string;
}

const DEFAULT_RECENT_RUNS = 5;

const getSupplementalErrorMessage = (error: unknown): string => {
	if (error instanceof ApiError) {
		return error.message;
	}

	if (error instanceof Error && error.message.length > 0) {
		return error.message;
	}

	return "unknown error";
};

export const registerGetSubcommand = (parent: Command): void => {
	const command = parent
		.command("get <deploymentId>")
		.description("Show deployment details with recent runs")
		.option(
			"--runs <n>",
			`number of recent runs to show (default ${DEFAULT_RECENT_RUNS})`,
		)
		.action(
			wrapPlayAction(
				async (
					command,
					deploymentId: string,
					options: GetDeploymentOptions,
				) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command);
					const spinner = createSpinner(ui);
					const runLimit = options.runs
						? Number.parseInt(options.runs, 10)
						: DEFAULT_RECENT_RUNS;

					try {
						spinner.start("Fetching deployment...");
						const deployment = await callApi(
							client.api.v1.deployments[":deploymentId"].$get,
							{
								param: { deploymentId },
							},
						);

						spinner.message("Fetching recent runs...");
						let recentRuns: {
							createdAt: string;
							durationMs?: number;
							runId: string;
							status: string;
						}[] = [];
						let recentRunsError: unknown;

						try {
							const runsResult = await callApi(client.api.v1.runs.$get, {
								query: {
									appId: deployment.appId,
									limit: String(runLimit),
								},
							});
							recentRuns = runsResult.items;
						} catch (error) {
							recentRunsError = error;
						}

						spinner.stop();

						if (ui.json) {
							writeJsonSuccess({ ...deployment, recentRuns });
							return;
						}

						if (recentRunsError) {
							showWarning(
								`Recent runs unavailable for this deployment; showing deployment details without them (${getSupplementalErrorMessage(recentRunsError)}).`,
								ui,
							);
						}

						console.log();
						console.log(formatDeploymentDetails(deployment, recentRuns));
						console.log();
					} catch (error) {
						spinner.stop();
						if (error instanceof ApiError) {
							showError(error.message, {
								json: ui.json,
								suggestion: "Check the deployment ID and try again.",
							});
							return;
						}

						showError(String(error), { json: ui.json });
					}
				},
			),
		);

	addExamplesAfter(command, [
		{ command: "bags play deployments get dep_abc123" },
		{
			description: "Show last 10 runs",
			command: "bags play deployments get dep_abc123 --runs 10",
		},
		{
			description: "Output as JSON",
			command: "bags play deployments get dep_abc123 --json",
		},
	]);
};
