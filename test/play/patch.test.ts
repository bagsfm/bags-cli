import { expect, mock, test } from "bun:test";
import { executePatch } from "../../src/play/commands/patch.ts";

test("executePatch requires admin auth before building", async () => {
	const showError = mock(() => undefined);

	await executePatch(
		"fee-compounder",
		"1.2.0",
		{},
		{
			resolveApiClientConfig: mock(async () => ({
				apiKey: "bags_prod_test_123",
				bagsApiUrl: "https://bags.example.com",
				playApiUrl: "https://play.example.com",
			})),
			showError,
			showSuccess: mock(() => undefined),
			writeJsonSuccess: mock(() => undefined),
		},
	);

	expect(showError).toHaveBeenCalledWith(
		expect.stringContaining("admin access"),
		expect.objectContaining({
			suggestion: expect.stringContaining("BAGS_PLAY_ADMIN_TOKEN"),
		}),
	);
});

test("executePatch rejects JSON mode without --force", async () => {
	const showError = mock(() => undefined);

	await executePatch(
		"fee-compounder",
		"1.2.0",
		{ json: true, token: "admin-token" },
		{
			resolveApiClientConfig: mock(async () => ({
				adminToken: "admin-token",
				apiKey: "bags_prod_test_123",
				bagsApiUrl: "https://bags.example.com",
				playApiUrl: "https://play.example.com",
			})),
			showError,
			showSuccess: mock(() => undefined),
			writeJsonSuccess: mock(() => undefined),
		},
	);

	expect(showError).toHaveBeenCalledWith(
		expect.stringContaining("--force"),
		expect.objectContaining({
			exitCode: 1,
		}),
	);
});
