/**
 * Output helpers for Play commands. Wraps chalk-based output in a way that
 * respects the global `--quiet` and `--json` flags.
 *
 * `showError` deliberately sets `process.exitCode` instead of calling
 * `process.exit()` so multi-step commands can finish flushing output before
 * the process terminates. Callers that need an immediate exit can pass an
 * `exit` override.
 *
 * Note: long-term we should consolidate this with the existing
 * `handleCliError` helper in `src/utils/errors.ts` (see PLAY_INTEGRATION.md
 * E11). Keeping a separate module for Phase 1 makes the port reviewable.
 *
 * @packageDocumentation
 */

import chalk from "chalk";
import { writeJsonError } from "./json-envelope.js";

const DEFAULT_USER_ERROR_EXIT_CODE = 1;

/**
 * Cheap argv-only check for `--json` (called before Commander has parsed).
 * Used by error/success helpers to switch between human-readable and
 * structured envelopes. The Commander-parsed value is preferred when
 * available; this fallback handles cases where the helper runs before
 * Commander.parseAsync (e.g. inside the auto-migration step).
 */
const isJsonModeFromArgv = (): boolean => process.argv.includes("--json");

/** Options accepted by `showError`. */
export interface ShowErrorOptions {
	/** Optional callback invoked with the resolved exit code. Defaults to `process.exitCode = code`. */
	exit?: (code: number) => void;
	/** Exit code to use. Defaults to 1 (matches bags-cli's existing behavior). */
	exitCode?: number;
	/** Short suggestion appended after the error message. */
	suggestion?: string;
}

/** Options accepted by `showSuccess` and `showWarning`. */
export interface QuietAware {
	quiet?: boolean;
}

/**
 * Prints an error message to stderr (or emits a JSON error envelope when in
 * JSON mode) and records the exit code on `process.exitCode`.
 */
export const showError = (
	message: string,
	{
		exit,
		exitCode = DEFAULT_USER_ERROR_EXIT_CODE,
		suggestion,
	}: ShowErrorOptions = {},
): void => {
	if (isJsonModeFromArgv()) {
		writeJsonError(message, { suggestion });
	} else {
		console.error(`${chalk.red("■")} ${message}`);
		if (suggestion) {
			console.error(suggestion);
		}
	}

	if (exit) {
		exit(exitCode);
	} else {
		process.exitCode = exitCode;
	}
};

/** Prints a success line to stdout unless `quiet` or JSON mode is active. */
export const showSuccess = (
	message: string,
	{ quiet = false }: QuietAware = {},
): void => {
	if (isJsonModeFromArgv() || quiet) {
		return;
	}
	console.log(`${chalk.green("◆")} ${message}`);
};

/** Prints a warning line to stdout unless `quiet` or JSON mode is active. */
export const showWarning = (
	message: string,
	{ quiet = false }: QuietAware = {},
): void => {
	if (isJsonModeFromArgv() || quiet) {
		return;
	}
	console.log(`${chalk.bold(chalk.yellow("WARNING"))}: ${message}`);
};
