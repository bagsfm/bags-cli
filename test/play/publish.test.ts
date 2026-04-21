import { expect, mock, test } from "bun:test";
import type { ApiClientConfig } from "../../src/play/api/client.ts";
import { executePublish } from "../../src/play/commands/publish.ts";
import {
	createMockJsonResponse,
	createSpinnerMock,
	createTestPlayClient,
	extractFetchUrl,
	TEST_APP,
} from "./helpers.ts";

const API_CLIENT_CONFIG: ApiClientConfig = {
	apiKey: "bags_prod_test_123",
	bagsApiUrl: "https://bags.example.com",
	playApiUrl: "https://play.example.com",
};

test("executePublish reports an existing version before uploading", async () => {
	const { client, fetchMock } = createTestPlayClient();
	const showError = mock(() => undefined);

	fetchMock.mockImplementation(async (input) => {
		expect(extractFetchUrl(input)).toContain(
			"/api/v1/apps/fee-compounder/versions/1.2.0",
		);

		return createMockJsonResponse(
			{
				appId: "fee-compounder",
				version: "1.2.0",
			},
			200,
		);
	});

	await executePublish(
		{},
		{
			buildDefinition: mock(async () => TEST_APP),
			createPlayClient: mock(() => client),
			createSpinner: createSpinnerMock,
			resolveApiClientConfig: mock(async () => API_CLIENT_CONFIG),
			showError,
			showSuccess: mock(() => undefined),
			writeJsonSuccess: mock(() => undefined),
		},
	);

	expect(showError).toHaveBeenCalledWith(
		expect.stringContaining("already exists"),
		expect.objectContaining({
			exitCode: 1,
		}),
	);
	expect(fetchMock).toHaveBeenCalledTimes(1);
});

test("executePublish returns JSON dry-run output without uploading", async () => {
	const { client, fetchMock } = createTestPlayClient();
	const writeJsonSuccess = mock(() => undefined);

	fetchMock.mockImplementation(async (input) => {
		expect(extractFetchUrl(input)).toContain(
			"/api/v1/apps/fee-compounder/versions/1.2.0",
		);

		return createMockJsonResponse({ error: "Not found" }, 404);
	});

	await executePublish(
		{ dryRun: true, json: true },
		{
			buildDefinition: mock(async () => TEST_APP),
			createPlayClient: mock(() => client),
			createSpinner: createSpinnerMock,
			resolveApiClientConfig: mock(async () => API_CLIENT_CONFIG),
			showError: mock(() => undefined),
			showSuccess: mock(() => undefined),
			writeJsonSuccess,
		},
	);

	expect(writeJsonSuccess).toHaveBeenCalledWith({
		appId: "fee-compounder",
		dryRun: true,
		version: "1.2.0",
	});
	expect(fetchMock).toHaveBeenCalledTimes(1);
});
