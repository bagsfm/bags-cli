import { expect, test } from "bun:test";
import { buildPauseRequest } from "../../src/play/commands/deployments/pause.ts";
import {
	getPlayCommandErrorDetails,
	PlayCommandError,
} from "../../src/play/utils/errors.ts";

test("buildPauseRequest keeps an explicit reason", () => {
	expect(
		buildPauseRequest({
			json: true,
			reason: "maintenance window",
		}),
	).toEqual({
		reason: "maintenance window",
	});
});

test("buildPauseRequest rejects JSON pause requests without a reason", () => {
	try {
		buildPauseRequest({
			json: true,
		});
		throw new Error("Expected buildPauseRequest to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "JSON mode requires `--reason <text>` (non-interactive).",
			suggestion: expect.stringContaining("--reason"),
		});
	}
});
