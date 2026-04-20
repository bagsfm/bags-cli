import { expect, test } from "bun:test";
import {
	PlayCommandError,
	getPlayCommandErrorDetails,
} from "../../src/play/utils/errors.ts";

test("getPlayCommandErrorDetails preserves suggestion and exit code", () => {
	const error = new PlayCommandError("No Play access.", {
		exitCode: 7,
		suggestion: "Run `bags auth login`.",
	});

	expect(getPlayCommandErrorDetails(error)).toEqual({
		exitCode: 7,
		message: "No Play access.",
		suggestion: "Run `bags auth login`.",
	});
});

test("getPlayCommandErrorDetails falls back to standard error messages", () => {
	expect(
		getPlayCommandErrorDetails(new Error("Something else failed.")),
	).toEqual({
		message: "Something else failed.",
	});
});
