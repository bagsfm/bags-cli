import { expect, test } from "bun:test";
import { buildSecretUpdateRequest } from "../../src/play/commands/secrets/update.ts";
import {
	getPlayCommandErrorDetails,
	PlayCommandError,
} from "../../src/play/utils/errors.ts";

test("buildSecretUpdateRequest allows rename-only updates in JSON mode", () => {
	expect(
		buildSecretUpdateRequest({
			json: true,
			name: "NEW_SECRET_NAME",
		}),
	).toEqual({
		name: "NEW_SECRET_NAME",
	});
});

test("buildSecretUpdateRequest rejects empty JSON updates", () => {
	try {
		buildSecretUpdateRequest({
			json: true,
		});
		throw new Error("Expected buildSecretUpdateRequest to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "JSON mode requires `--name` or `--value` for secrets update.",
			suggestion: expect.stringContaining("--name"),
		});
	}
});
