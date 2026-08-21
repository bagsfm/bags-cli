import { expect, test } from "bun:test";
import { assertPlayApiAccess } from "../../src/play/api/auth.ts";
import {
	PlayCommandError,
	getPlayCommandErrorDetails,
} from "../../src/play/utils/errors.ts";

test("assertPlayApiAccess returns compatible credentials for regular commands", () => {
	expect(
		assertPlayApiAccess({
			apiKey: "bags_prod_test_123",
		}),
	).toEqual({
		adminToken: undefined,
		apiKey: "bags_prod_test_123",
	});
});

test("assertPlayApiAccess rejects missing API keys with a login hint", () => {
	try {
		assertPlayApiAccess({});
		throw new Error("Expected assertPlayApiAccess to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "Not authenticated.",
			suggestion: expect.stringContaining("bags auth login"),
		});
	}
});

test("assertPlayApiAccess rejects non-Play-compatible API keys", () => {
	try {
		assertPlayApiAccess({
			apiKey: "bags_test_123",
		});
		throw new Error("Expected assertPlayApiAccess to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "Your current Bags API key isn't compatible with Play.",
			suggestion: expect.stringContaining("dev.bags.fm"),
		});
	}
});

test("assertPlayApiAccess requires admin auth for admin commands", () => {
	try {
		assertPlayApiAccess({
			apiKey: "bags_prod_test_123",
			requireAdmin: true,
		});
		throw new Error("Expected assertPlayApiAccess to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(getPlayCommandErrorDetails(error)).toMatchObject({
			message: "This command requires admin access.",
			suggestion: expect.stringContaining("BAGS_PLAY_ADMIN_TOKEN"),
		});
	}
});
