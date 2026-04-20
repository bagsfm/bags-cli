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
import { formatRunDetails, summarizeFeeRecords } from "./format.js";

const handleRunLookupError = (error: unknown, json: boolean): void => {
	if (error instanceof ApiError) {
		showError(error.message, {
			json,
			suggestion: "Check the run ID and try again.",
		});
		return;
	}

	showError(String(error), { json });
};

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
		.command("get <runId>")
		.description("Show run details")
		.action(
			wrapPlayAction(async (command, runId: string) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching run...");
					const [run, feesResult] = await Promise.allSettled([
						callApi(client.api.v1.runs[":runId"].$get, {
							param: { runId },
						}),
						callApi(client.api.v1.runs[":runId"].fees.$get, {
							param: { runId },
						}),
					]);
					spinner.stop();

					if (run.status === "rejected") {
						handleRunLookupError(run.reason, ui.json);
						return;
					}

					const runData = run.value;

					if (ui.json) {
						const payload =
							feesResult.status === "fulfilled"
								? { ...runData, fees: feesResult.value.fees }
								: runData;
						writeJsonSuccess(payload);
						return;
					}

					if (feesResult.status === "rejected") {
						showWarning(
							`Fee records unavailable for this run; showing run details without fee summary (${getSupplementalErrorMessage(feesResult.reason)}).`,
							ui,
						);
					}

					const feeSummary =
						feesResult.status === "fulfilled"
							? summarizeFeeRecords(feesResult.value.fees)
							: undefined;

					console.log();
					console.log(formatRunDetails(runData, new Date(), feeSummary));
					console.log();
				} catch (error) {
					spinner.stop();
					handleRunLookupError(error, ui.json);
				}
			}),
		);

	addExamplesAfter(command, [
		{ command: "bags play runs get run_abc123" },
		{
			description: "Output as JSON",
			command: "bags play runs get run_abc123 --json",
		},
	]);
};
