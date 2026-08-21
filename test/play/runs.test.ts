import { expect, test } from "bun:test";
import { parseTriggerInputs } from "../../src/play/commands/runs/trigger.ts";
import {
	getPlayCommandErrorDetails,
	PlayCommandError,
} from "../../src/play/utils/errors.ts";

test("parseTriggerInputs parses repeatable key=value pairs", () => {
	expect(
		parseTriggerInputs(["tokenMint=abc123", "amount=100", "note=hello=world"]),
	).toEqual({
		amount: "100",
		note: "hello=world",
		tokenMint: "abc123",
	});
});

test("parseTriggerInputs rejects malformed pairs", () => {
	try {
		parseTriggerInputs(["broken"]);
		throw new Error("Expected parseTriggerInputs to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "Invalid `--input` value: broken. Expected key=value.",
			suggestion: expect.stringContaining("tokenMint=abc"),
		});
	}
});
