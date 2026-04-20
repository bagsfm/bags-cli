import type { Command } from "commander";
import { flagOrPrompt } from "../../../lib/prompt.js";
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

interface PauseOptions {
	reason?: string;
	token?: string;
}

const hasText = (value: string | undefined): value is string =>
	typeof value === "string" && value.trim().length > 0;

export const buildPauseRequest = ({
	json = false,
	reason,
}: PauseOptions & { json?: boolean }): { reason: string } => {
	if (!hasText(reason)) {
		throw new PlayCommandError(
			json
				? "JSON mode requires `--reason <text>` (non-interactive)."
				: "A pause reason is required.",
			{
				suggestion: json
					? 'Run `bags play deployments pause <deploymentId> --reason "..." --json`.'
					: "Provide `--reason` or answer the prompt.",
			},
		);
	}

	return { reason: reason.trim() };
};

const resolvePauseReason = async (
	reason: string | undefined,
	json: boolean,
): Promise<string | undefined> => {
	if (hasText(reason)) {
		return reason;
	}

	if (json) {
		return undefined;
	}

	return await flagOrPrompt(
		undefined,
		"Reason for pausing this deployment:",
		(value) => (value.trim().length > 0 ? true : "Reason is required."),
	);
};

export const registerPauseSubcommand = (parent: Command): void => {
	const command = parent
		.command("pause <deploymentId>")
		.description("Pause an active deployment [admin]")
		.option("--reason <text>", "reason for pausing (skips prompt)")
		.option("--token <token>", "admin token (overrides BAGS_PLAY_ADMIN_TOKEN)")
		.action(
			wrapPlayAction(
				async (command, deploymentId: string, options: PauseOptions) => {
					const ui = await resolvePlayCommandUiState(command);
					const client = await getPlayClientForCommand(command, {
						adminToken: options.token,
						requireAdmin: true,
					});
					const spinner = createSpinner(ui);
					const reason = await resolvePauseReason(options.reason, ui.json);
					const request = buildPauseRequest({
						json: ui.json,
						reason,
					});

					try {
						spinner.start("Pausing deployment...");
						await callApi(
							client.api.v1.admin.deployments[":deploymentId"].pause.$post,
							{
								param: { deploymentId },
								json: request,
							},
						);
						spinner.stop(`Deployment ${deploymentId} paused.`);

						if (ui.json) {
							writeJsonSuccess({ deploymentId });
						}
					} catch (error) {
						spinner.stop();
						showError(
							error instanceof ApiError ? error.message : String(error),
							{
								json: ui.json,
							},
						);
					}
				},
			),
		);

	addExamplesAfter(command, [
		{ command: "bags play deployments pause dep_abc123" },
		{
			description: "Skip prompt",
			command: 'bags play deployments pause dep_abc123 --reason "maintenance"',
		},
	]);
};
