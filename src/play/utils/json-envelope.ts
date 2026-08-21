/**
 * JSON output envelope used by Play commands when `--json` is active.
 *
 * The envelope shape is intentionally identical to the one emitted by
 * play-cli (`packages/cli/src/utils/json.ts`) so any external scripts that
 * parsed `bags <cmd> --json` against the standalone play-cli continue to
 * work after migrating to `bags play <cmd> --json`.
 *
 * Success envelope is written to stdout; error envelope to stderr.
 *
 * @packageDocumentation
 */

/** Success envelope payload shape. */
export interface JsonSuccessEnvelope<T> {
	readonly data: T;
	readonly success: true;
}

/** Error envelope payload shape. */
export interface JsonErrorEnvelope {
	readonly error: {
		readonly message: string;
		readonly suggestion?: string;
	};
	readonly success: false;
}

/** Writes a success envelope to stdout. */
export const writeJsonSuccess = <T>(data: T): void => {
	const envelope: JsonSuccessEnvelope<T> = { success: true, data };
	console.log(JSON.stringify(envelope, null, 2));
};

/** Writes an error envelope to stderr. */
export const writeJsonError = (
	message: string,
	opts?: { readonly suggestion?: string },
): void => {
	const envelope: JsonErrorEnvelope = {
		success: false,
		error: {
			message,
			...(opts?.suggestion === undefined
				? {}
				: { suggestion: opts.suggestion }),
		},
	};
	console.error(JSON.stringify(envelope, null, 2));
};
