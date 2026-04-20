import chalk from "chalk";
import type { Command } from "commander";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { formatLamportsAsSol, truncateAddress } from "../../utils/format.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";

interface FeeRecord {
	readonly actionId: string;
	readonly amountLamports: string;
	readonly depositSignature: string;
	readonly nodeId: string;
	readonly pluginId: string;
	readonly refundSignature?: string;
	readonly settlementSignature?: string;
	readonly status: string;
	readonly treasury: string;
}

const pickFeeDisplaySignature = (fee: FeeRecord): string => {
	if (fee.status === "settled" && fee.settlementSignature) {
		return fee.settlementSignature;
	}

	if (fee.status === "refunded" && fee.refundSignature) {
		return fee.refundSignature;
	}

	return fee.depositSignature;
};

const printRunFeesHuman = (runId: string, fees: readonly FeeRecord[]): void => {
	let totalLamports = 0n;

	console.log(chalk.bold(`\n  Fee records (${fees.length}) — ${runId}\n`));
	for (const fee of fees) {
		totalLamports += BigInt(fee.amountLamports);
		const signature = pickFeeDisplaySignature(fee);

		console.log(
			`  ${chalk.bold(fee.nodeId)}  ${fee.pluginId}/${fee.actionId}  ${formatLamportsAsSol(fee.amountLamports)}  ${fee.status}`,
		);
		console.log(
			`    ${chalk.dim("treasury")} ${truncateAddress(fee.treasury, 6)}  ${chalk.dim("tx")} ${truncateAddress(signature, 6)}`,
		);
	}
	console.log();
	console.log(
		`  ${chalk.bold("Total:")} ${formatLamportsAsSol(totalLamports)}`,
	);
	console.log();
};

export const registerFeesSubcommand = (parent: Command): void => {
	const command = parent
		.command("fees <runId>")
		.description("List paid-action fee records for a run")
		.action(
			wrapPlayAction(async (command, runId: string) => {
				const ui = await resolvePlayCommandUiState(command);
				const client = await getPlayClientForCommand(command);
				const spinner = createSpinner(ui);

				try {
					spinner.start("Fetching fee records...");
					const result = await callApi(client.api.v1.runs[":runId"].fees.$get, {
						param: { runId },
					});
					spinner.stop();

					if (ui.json) {
						writeJsonSuccess(result);
						return;
					}

					if (result.fees.length === 0) {
						console.log(chalk.dim("\n  No fee records for this run.\n"));
						return;
					}

					printRunFeesHuman(result.runId, result.fees);
				} catch (error) {
					spinner.stop();
					showError(error instanceof ApiError ? error.message : String(error), {
						json: ui.json,
						suggestion: "Check the run ID and that fee storage is available.",
					});
				}
			}),
		);

	addExamplesAfter(command, [
		{ command: "bags play runs fees run_abc123" },
		{
			description: "JSON output",
			command: "bags play runs fees run_abc123 --json",
		},
	]);
};
