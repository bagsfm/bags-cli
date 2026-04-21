import { expect, mock, test } from "bun:test";
import { executeRegisterPlugin } from "../../src/play/commands/plugins/index.ts";
import {
	createMockJsonResponse,
	createTestPlayClient,
	extractFetchUrl,
} from "./helpers.ts";

const createSpinnerMock = () => {
	return {
		fail: mock(() => undefined),
		isSpinning: false,
		message: mock(() => undefined),
		start: mock(() => undefined),
		stop: mock(() => undefined),
	};
};

test("executeRegisterPlugin posts the package name and writes JSON in JSON mode", async () => {
	const { client, fetchMock } = createTestPlayClient();
	const spinner = createSpinnerMock();
	const writeJsonSuccess = mock(() => undefined);

	fetchMock.mockImplementation(async (input, init) => {
		expect(extractFetchUrl(input)).toContain("/api/v1/admin/plugins/register");
		expect(init?.method).toBe("POST");
		expect(JSON.parse(String(init?.body))).toEqual({
			packageName: "@bagsfm/play-bags-plugin",
		});

		return createMockJsonResponse({
			pluginId: "bags-plugin",
			version: "1.2.0",
		});
	});

	await executeRegisterPlugin(
		"@bagsfm/play-bags-plugin",
		{ json: true, quiet: false },
		{
			createSpinner: () => spinner,
			getClient: async () => client,
			logger: { info: mock(() => undefined) },
			showError: mock(() => undefined),
			writeJsonSuccess,
		},
	);

	expect(spinner.start).toHaveBeenCalledWith(
		"Registering @bagsfm/play-bags-plugin...",
	);
	expect(writeJsonSuccess).toHaveBeenCalledWith({
		pluginId: "bags-plugin",
		version: "1.2.0",
	});
});

test("executeRegisterPlugin prints the previous version in human mode", async () => {
	const { client, fetchMock } = createTestPlayClient();
	const logger = { info: mock(() => undefined) };

	fetchMock.mockImplementation(async () =>
		createMockJsonResponse({
			pluginId: "bags-plugin",
			previousVersion: "1.1.0",
			version: "1.2.0",
		}),
	);

	await executeRegisterPlugin(
		"@bagsfm/play-bags-plugin",
		{ json: false, quiet: false },
		{
			createSpinner: createSpinnerMock,
			getClient: async () => client,
			logger,
			showError: mock(() => undefined),
			writeJsonSuccess: mock(() => undefined),
		},
	);

	expect(logger.info).toHaveBeenCalledWith(
		expect.stringContaining("Plugin registered: bags-plugin v1.2.0"),
	);
	expect(logger.info).toHaveBeenCalledWith(
		expect.stringContaining("Updated from v1.1.0"),
	);
});
