import { expect, mock, test } from "bun:test";
import {
	buildArtifactFilename,
	executeBuild,
} from "../../src/play/commands/build.ts";
import { createSpinnerMock, TEST_APP } from "./helpers.ts";

test("buildArtifactFilename normalizes the app id and version", () => {
	expect(buildArtifactFilename("Fee Compounder!", "1.2.0")).toBe(
		"fee_compounder_1_2_0.json",
	);
});

test("executeBuild writes the artifact and emits JSON success data", async () => {
	const spinner = createSpinnerMock();
	const buildDefinition = mock(async () => TEST_APP);
	const makeDirectory = mock(async () => undefined);
	const serializeApp = mock(() => '{"id":"fee-compounder"}');
	const showError = mock(() => undefined);
	const showSuccess = mock(() => undefined);
	const writeFile = mock(async () => undefined);
	const writeJsonSuccess = mock(() => undefined);

	await executeBuild(
		{ json: true, output: "release" },
		{
			buildDefinition,
			createSpinner: () => spinner,
			cwd: "/tmp/workspace",
			makeDirectory,
			serializeApp,
			showError,
			showSuccess,
			writeFile,
			writeJsonSuccess,
		},
	);

	expect(buildDefinition).toHaveBeenCalledWith("/tmp/workspace", false);
	expect(makeDirectory).toHaveBeenCalledWith("/tmp/workspace/release");
	expect(writeFile).toHaveBeenCalledWith(
		"/tmp/workspace/release/fee_compounder_1_2_0.json",
		'{"id":"fee-compounder"}',
	);
	expect(writeJsonSuccess).toHaveBeenCalledWith({
		appId: "fee-compounder",
		artifactPath: "release/fee_compounder_1_2_0.json",
		version: "1.2.0",
	});
	expect(showError).not.toHaveBeenCalled();
	expect(showSuccess).not.toHaveBeenCalled();
});
