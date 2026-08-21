export interface PlayCommandErrorOptions {
	readonly exitCode?: number;
	readonly suggestion?: string;
}

export interface PlayCommandErrorDetails extends PlayCommandErrorOptions {
	readonly message: string;
}

const DEFAULT_EXIT_CODE = 1;

export class PlayCommandError extends Error {
	readonly exitCode: number;
	readonly suggestion?: string;

	constructor(message: string, options: PlayCommandErrorOptions = {}) {
		super(message);
		this.name = "PlayCommandError";
		this.exitCode = options.exitCode ?? DEFAULT_EXIT_CODE;
		this.suggestion = options.suggestion;
	}
}

export const getPlayCommandErrorDetails = (
	error: unknown,
): PlayCommandErrorDetails => {
	if (error instanceof PlayCommandError) {
		return {
			exitCode: error.exitCode,
			message: error.message,
			suggestion: error.suggestion,
		};
	}

	if (error instanceof Error) {
		return { message: error.message };
	}

	return { message: String(error) };
};
