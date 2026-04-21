import { describe, expect, mock, test } from "bun:test";
import type { AppDefinition } from "@bagsfm/play-shared";
import type { ApiClientConfig } from "../../src/play/api/client.ts";
import { executeInfo } from "../../src/play/commands/info.ts";
import {
	appRef,
	muted,
	sectionHeader,
	status,
	url,
} from "../../src/play/utils/colors.ts";
import {
	createMockJsonResponse,
	createTestPlayClient,
	extractFetchUrl,
} from "./helpers.ts";

const TEST_APP: AppDefinition = {
	description: "Automatically compounds protocol fees into liquidity.",
	edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
	id: "fee-compounder",
	interface: {
		inputs: [
			{ name: "tokenMint", required: true, type: "string" },
			{ default: 3, name: "minClaimSol", required: false, type: "number" },
		],
		outputs: [{ name: "processedMints", type: "array" }],
	},
	manifest: {
		author: "your-wallet-address",
		category: "community",
		tags: ["fees", "liquidity"],
		visibility: "public",
	},
	name: "Fee Compounder",
	nodes: [
		{ id: "node-1", type: "action" },
		{ id: "node-2", type: "action" },
	],
	trigger: { schedule: "0 * * * *", type: "cron" },
	version: "1.2.0",
};

const TEST_APP_VERSION_RESPONSE = {
	appId: TEST_APP.id,
	id: "app_version_123",
	publishedAt: "2026-03-01T00:00:00.000Z",
	snapshot: TEST_APP,
	verified: true,
	version: 3,
};

const PREVIOUS_APP_VERSION_RESPONSE = {
	...TEST_APP_VERSION_RESPONSE,
	id: "app_version_122",
	publishedAt: "2026-02-15T00:00:00.000Z",
	snapshot: {
		...TEST_APP,
		version: "1.1.0",
	},
	verified: false,
	version: 2,
};

const STORE_APP_RESPONSE = {
	appId: TEST_APP.id,
	currentVersion: 3,
	description: TEST_APP.description,
	edges: TEST_APP.edges,
	interface: TEST_APP.interface,
	lifecycleStatus: "published" as const,
	manifest: TEST_APP.manifest,
	name: TEST_APP.name,
	nodes: TEST_APP.nodes,
	trigger: TEST_APP.trigger,
	version: TEST_APP.version,
};

const API_CLIENT_CONFIG: ApiClientConfig = {
	apiKey: "bags_prod_test_123",
	bagsApiUrl: "https://bags.example.com",
	playApiUrl: "https://play.example.com",
};

const createInfoDependencies = () => {
	const { client, fetchMock } = createTestPlayClient();

	return {
		createPlayClient: mock(() => client),
		describeApp: mock(() => undefined),
		env: {},
		executeEntryFile: mock(async () => TEST_APP),
		fetchMock,
		logger: {
			info: mock(() => undefined),
		},
		readProjectConfig: mock(async () => ({
			entry: "src/app.ts",
			packageManager: "bun" as const,
			runtime: "bun" as const,
		})),
		resolveApiClientConfig: mock(async () => API_CLIENT_CONFIG),
		showError: mock(() => undefined),
		writeJsonSuccess: mock(() => undefined),
	};
};

describe.concurrent("executeInfo", () => {
	test.concurrent("shows local app metadata and registry status", async () => {
		const deps = createInfoDependencies();
		deps.fetchMock.mockImplementation(async () =>
			createMockJsonResponse([TEST_APP_VERSION_RESPONSE]),
		);

		await executeInfo(undefined, {}, deps);

		expect(deps.readProjectConfig).toHaveBeenCalledWith(process.cwd());
		expect(deps.executeEntryFile).toHaveBeenCalledWith(
			expect.stringContaining("src/app.ts"),
			"bun",
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining(appRef("fee-compounder@1.2.0")),
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining(sectionHeader("Manifest:")),
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining(
				status("Published (public, verified)", "success"),
			),
		);
	});

	test.concurrent("shows a clear error when not in a Play project directory", async () => {
		const deps = createInfoDependencies();
		deps.readProjectConfig = mock(() => {
			throw new Error(
				"No bags.toml found. Run `bags play init` to create a project.",
			);
		});

		await executeInfo(undefined, {}, deps);

		expect(deps.showError).toHaveBeenCalledWith(
			"No bags.toml found. Run `bags play init` to create a project.",
			expect.objectContaining({
				suggestion: "Run `bags play init` to create a project.",
			}),
		);
	});

	test.concurrent("degrades gracefully when local registry status lookup fails", async () => {
		const deps = createInfoDependencies();
		deps.fetchMock.mockImplementation(() =>
			Promise.reject(new Error("connect ECONNREFUSED")),
		);

		await executeInfo(undefined, {}, deps);

		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining(muted("unknown (offline)")),
		);
		expect(deps.showError).not.toHaveBeenCalled();
	});

	test.concurrent("writes local AppDefinition JSON when --json is used", async () => {
		const deps = createInfoDependencies();

		await executeInfo(undefined, { json: true }, deps);

		expect(deps.writeJsonSuccess).toHaveBeenCalledWith(TEST_APP);
		expect(deps.logger.info).not.toHaveBeenCalled();
	});

	test.concurrent("shows store metadata for the latest published version", async () => {
		const deps = createInfoDependencies();
		deps.fetchMock.mockImplementation((input) => {
			const requestUrl = extractFetchUrl(input);
			if (requestUrl.includes("/versions")) {
				return Promise.resolve(
					createMockJsonResponse([
						TEST_APP_VERSION_RESPONSE,
						PREVIOUS_APP_VERSION_RESPONSE,
					]),
				);
			}

			return Promise.resolve(createMockJsonResponse(STORE_APP_RESPONSE));
		});

		await executeInfo("fee-compounder", {}, deps);

		expect(deps.resolveApiClientConfig).toHaveBeenCalledWith(
			{
				apiKey: undefined,
				bagsApiUrl: undefined,
				playApiUrl: undefined,
			},
			deps.env,
			undefined,
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("(registry)"),
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining(
				url("https://play.example.com/apps/fee-compounder"),
			),
		);
	});

	test.concurrent("lists all published versions when --versions is used", async () => {
		const deps = createInfoDependencies();
		deps.fetchMock.mockImplementation(async () =>
			createMockJsonResponse([
				TEST_APP_VERSION_RESPONSE,
				PREVIOUS_APP_VERSION_RESPONSE,
			]),
		);

		await executeInfo("fee-compounder", { versions: true }, deps);

		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("fee-compounder - published versions:"),
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("1.2.0"),
		);
		expect(deps.logger.info).toHaveBeenCalledWith(
			expect.stringContaining("1.1.0"),
		);
	});

	test.concurrent("shows an auth error for App Store mode when no API key is configured", async () => {
		const deps = createInfoDependencies();
		deps.resolveApiClientConfig = mock(async () => ({
			...API_CLIENT_CONFIG,
			apiKey: undefined,
		}));

		await executeInfo("fee-compounder", {}, deps);

		expect(deps.showError).toHaveBeenCalledWith(
			"Not authenticated.",
			expect.objectContaining({
				suggestion: expect.stringContaining("bags auth login"),
			}),
		);
	});

	test.concurrent("rejects --versions when no app ID is provided", async () => {
		const deps = createInfoDependencies();

		await executeInfo(undefined, { versions: true }, deps);

		expect(deps.showError).toHaveBeenCalledWith(
			"`--versions` can only be used with an App ID.",
			expect.any(Object),
		);
	});
});
