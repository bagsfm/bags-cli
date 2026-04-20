import type { Command } from "commander";
import { ApiError, callApi } from "../../api/client.js";
import {
	resolvePlayCommandUiState,
	wrapPlayAction,
} from "../../utils/command.js";
import { getPlayClientForCommand } from "../../utils/command-client.js";
import { PlayCommandError } from "../../utils/errors.js";
import { addExamplesAfter } from "../../utils/help.js";
import { writeJsonSuccess } from "../../utils/json-envelope.js";
import { createSpinner, showError } from "../../utils/output.js";

interface TriggerOptions {
	input?: string[];
}

export const parseTriggerInputs = (
	pairs: string[] | undefined,
): Record<string, string> | undefined => {
	if (!pairs || pairs.length === 0) {
		return undefined;
	}

	const inputs: Record<string, string> = {};
	for (const pair of pairs) {
		const eqIndex = pair.indexOf("=");
		if (eqIndex <= 0) {
			throw new PlayCommandError(
				`Invalid \`--input\` value: ${pair}. Expected key=value.`,
				{
					suggestion: "Use `--input tokenMint=abc --input amount=100`.",
				},
			);
		}

		const key = pair.slice(0, eqIndex);
		const value = pair.slice(eqIndex + 1);
		inputs[key] = value;
	}

	return Object.keys(inputs).length > 0 ? inputs : undefined;
};

export const registerTriggerSubcommand = (parent: Command): void => {
	const command = parent
		.command("trigger <appId>")
		.description("Trigger a new run for an App")
		.option(
			"--input <key=value>",
			"input value (repeatable)",
			(value: string, collected: string[]) => {
				collected.push(value);
				return collected;
			},
			[] as string[],
		)
		.action(
			wrapPlayAction(
				async (command, appId: string, options: TriggerOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command);
					const spinner = createSpinner(ui);
					const inputs = parseTriggerInputs(options.input);

					try {
						spinner.start("Triggering run...");
						const result = await callApi(
							client.api.v1.apps[":appId"].run.$post,
							{
								param: { appId },
								json: { inputs },
							},
						);
						spinner.stop(`Run ${result.runId} triggered (${result.status})`);

						if (ui.json) {
							writeJsonSuccess(result);
						}
					} catch (error) {
						spinner.stop();
						showError(
							error instanceof ApiError ? error.message : String(error),
							{
								json: ui.json,
								suggestion:
									error instanceof ApiError
										? "Check the App ID and your inputs."
										: undefined,
							},
						);
					}
				},
			),
		);

	addExamplesAfter(command, [
		{ command: "bags play runs trigger my-app" },
		{
			description: "With inputs",
			command:
				"bags play runs trigger my-app --input tokenMint=abc --input amount=100",
		},
		{
			description: "Output as JSON",
			command: "bags play runs trigger my-app --json",
		},
	]);
};
