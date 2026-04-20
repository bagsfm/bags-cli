import { expect, test } from "bun:test";
import { assertForceForJsonMutation } from "../../src/play/utils/confirmation.ts";
import {
	getPlayCommandErrorDetails,
	PlayCommandError,
} from "../../src/play/utils/errors.ts";

test("assertForceForJsonMutation rejects JSON mutations without --force", () => {
	try {
		assertForceForJsonMutation({
			actionLabel: "cancel without confirmation",
			commandExample: "bags play runs cancel run_abc123 --force --json",
			force: false,
			json: true,
		});
		throw new Error("Expected assertForceForJsonMutation to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "JSON mode requires `--force` to cancel without confirmation.",
			suggestion: expect.stringContaining("--force --json"),
		});
	}
});

test("assertForceForJsonMutation allows confirmed mutations", () => {
	expect(() =>
		assertForceForJsonMutation({
			actionLabel: "delete without confirmation",
			commandExample: "bags play secrets delete sec_abc123 --force --json",
			force: true,
			json: true,
		}),
	).not.toThrow();
});
