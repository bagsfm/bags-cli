import chalk from "chalk";
import ora from "ora";
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

const resolveJsonMode = (json?: boolean): boolean => {
	return json ?? isJsonModeFromArgv();
};

export interface PlaySpinner {
	readonly isSpinning: boolean;
	fail(message?: string): void;
	message(text: string): void;
	start(message?: string): void;
	stop(message?: string): void;
}

const createQuietSpinner = (): PlaySpinner => {
	return {
		isSpinning: false,
		fail: () => undefined,
		message: () => undefined,
		start: () => undefined,
		stop: () => undefined,
	};
};

export interface CreateSpinnerOptions extends QuietAware {
	json?: boolean;
}

/** Options accepted by `showError`. */
export interface ShowErrorOptions {
	/** Optional callback invoked with the resolved exit code. Defaults to `process.exitCode = code`. */
	exit?: (code: number) => void;
	/** Exit code to use. Defaults to 1 (matches bags-cli's existing behavior). */
	exitCode?: number;
	/** Pre-resolved JSON mode from Commander/config; falls back to argv when omitted. */
	json?: boolean;
	/** Short suggestion appended after the error message. */
	suggestion?: string;
}

/** Options accepted by `showSuccess` and `showWarning`. */
export interface QuietAware {
	json?: boolean;
	quiet?: boolean;
}

export const createSpinner = ({
	json,
	quiet = false,
}: CreateSpinnerOptions = {}): PlaySpinner => {
	if (quiet || resolveJsonMode(json)) {
		return createQuietSpinner();
	}

	const spinner = ora();
	return {
		get isSpinning() {
			return spinner.isSpinning;
		},
		fail(message?: string) {
			if (message) {
				spinner.fail(message);
				return;
			}

			spinner.stop();
		},
		message(text: string) {
			spinner.text = text;
		},
		start(message?: string) {
			if (message) {
				spinner.start(message);
				return;
			}

			spinner.start();
		},
		stop(message?: string) {
			if (message) {
				spinner.stopAndPersist({ text: message });
				return;
			}

			spinner.stop();
		},
	};
};

/**
 * Prints an error message to stderr (or emits a JSON error envelope when in
 * JSON mode) and records the exit code on `process.exitCode`.
 */
export const showError = (
	message: string,
	{
		exit,
		exitCode = DEFAULT_USER_ERROR_EXIT_CODE,
		json,
		suggestion,
	}: ShowErrorOptions = {},
): void => {
	if (resolveJsonMode(json)) {
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
	{ json, quiet = false }: QuietAware = {},
): void => {
	if (resolveJsonMode(json) || quiet) {
		return;
	}
	console.log(`${chalk.green("◆")} ${message}`);
};

/** Prints a warning line to stdout unless `quiet` or JSON mode is active. */
export const showWarning = (
	message: string,
	{ json, quiet = false }: QuietAware = {},
): void => {
	if (resolveJsonMode(json) || quiet) {
		return;
	}
	console.log(`${chalk.bold(chalk.yellow("WARNING"))}: ${message}`);
};
