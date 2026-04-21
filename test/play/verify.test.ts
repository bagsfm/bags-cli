import { expect, mock, test } from "bun:test";
import type { ApiClientConfig } from "../../src/play/api/client.ts";
import { executeVerify } from "../../src/play/commands/verify.ts";
import {
	createMockJsonResponse,
	createTestPlayClient,
	extractFetchUrl,
} from "./helpers.ts";

const API_CLIENT_CONFIG: ApiClientConfig = {
	adminToken: "admin-token",
	apiKey: "bags_prod_test_123",
	bagsApiUrl: "https://bags.example.com",
	playApiUrl: "https://play.example.com",
};

test("executeVerify resolves the latest version by publishedAt when omitted", async () => {
	const { client, fetchMock } = createTestPlayClient();
	const writeJsonSuccess = mock(() => undefined);

	fetchMock.mockImplementation(async (input) => {
		const requestUrl = extractFetchUrl(input);

		if (requestUrl.endsWith("/api/v1/apps/fee-compounder/versions")) {
			return createMockJsonResponse([
				{
					appId: "fee-compounder",
					id: "version_1",
					publishedAt: "2026-02-01T00:00:00.000Z",
					publishedBy: "user_1",
					snapshot: { version: "1.1.0" },
					verified: false,
					version: "1.1.0",
				},
				{
					appId: "fee-compounder",
					id: "version_2",
					publishedAt: "2026-03-01T00:00:00.000Z",
					publishedBy: "user_1",
					snapshot: { version: "1.2.0" },
					verified: false,
					version: "1.2.0",
				},
			]);
		}

		expect(requestUrl).toContain(
			"/api/v1/admin/apps/fee-compounder/versions/1.2.0/verify",
		);
		return createMockJsonResponse({
			appId: "fee-compounder",
			publishedAt: "2026-03-01T00:00:00.000Z",
			snapshot: { version: "1.2.0" },
			verified: true,
			version: "1.2.0",
		});
	});

	await executeVerify(
		"fee-compounder",
		undefined,
		{ json: true },
		{
			createPlayClient: mock(() => client),
			resolveApiClientConfig: mock(async () => API_CLIENT_CONFIG),
			showError: mock(() => undefined),
			showSuccess: mock(() => undefined),
			writeJsonSuccess,
		},
	);

	expect(writeJsonSuccess).toHaveBeenCalledWith({
		appId: "fee-compounder",
		verified: true,
		version: "1.2.0",
	});
});
