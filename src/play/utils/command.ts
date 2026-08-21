import type { Command } from "commander";
import { mergeJsonInputArgs } from "../../lib/command.js";
import { isQuietMode, shouldUseJson } from "../../lib/output.js";
import { handleCliError, isUserAbort } from "../../utils/errors.js";
import { getPlayCommandErrorDetails } from "./errors.js";
import { showError } from "./output.js";

export interface PlayCommandUiState {
	readonly json: boolean;
	readonly quiet: boolean;
}

export const resolvePlayCommandUiState = async (
	command: Command,
): Promise<PlayCommandUiState> => {
	return {
		json: await shouldUseJson(command),
		quiet: isQuietMode(command),
	};
};

export function wrapPlayAction<T extends unknown[]>(
	fn: (command: Command, ...args: T) => Promise<void> | void,
): (...args: [...T, Command]) => Promise<void> {
	return async (...args: [...T, Command]) => {
		const command = args[args.length - 1] as Command;

		try {
			const rest = mergeJsonInputArgs(command, args.slice(0, -1)) as T;
			await fn(command, ...rest);
		} catch (error) {
			if (isUserAbort(error)) {
				handleCliError(error);
			}
			const ui = await resolvePlayCommandUiState(command);
			const details = getPlayCommandErrorDetails(error);
			showError(details.message, {
				exitCode: details.exitCode,
				json: ui.json,
				suggestion: details.suggestion,
			});
		}
	};
}
