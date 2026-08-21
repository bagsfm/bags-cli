import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { serializeApp } from "@bagsfm/play-sdk/app-utils";
import type { AppDefinition } from "@bagsfm/play-shared";
import { loadValidatedAppDefinition } from "../utils/build.js";
import { filePath } from "../utils/colors.js";
import { getPlayCommandErrorDetails } from "../utils/errors.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { createSpinner, showError, showSuccess } from "../utils/output.js";

const DEFAULT_OUTPUT_DIRECTORY = "release";

export interface BuildCommandOptions {
	json?: boolean;
	output?: string;
	quiet?: boolean;
}

export interface ExecuteBuildDependencies {
	readonly buildDefinition?: (
		cwd: string,
		quiet: boolean,
	) => Promise<AppDefinition>;
	readonly createSpinner?: typeof createSpinner;
	readonly cwd?: string;
	readonly makeDirectory?: (directory: string) => Promise<void>;
	readonly serializeApp?: typeof serializeApp;
	readonly showError?: typeof showError;
	readonly showSuccess?: typeof showSuccess;
	readonly writeFile?: (path: string, contents: string) => Promise<void>;
	readonly writeJsonSuccess?: typeof writeJsonSuccess;
}

const buildDefinition = async (
	cwd: string,
	quiet: boolean,
): Promise<AppDefinition> => {
	return await loadValidatedAppDefinition({
		commandLabel: "bags play build",
		cwd,
		quiet,
	});
};

export const buildArtifactFilename = (id: string, version: string): string => {
	const normalizedId = id
		.replace(/[^a-zA-Z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.toLowerCase();
	const normalizedVersion = version.replace(/\./g, "_");

	return `${normalizedId}_${normalizedVersion}.json`;
};

export const executeBuild = async (
	options: BuildCommandOptions,
	{
		buildDefinition: buildDefinitionImpl = buildDefinition,
		createSpinner: createSpinnerImpl = createSpinner,
		cwd = process.cwd(),
		makeDirectory = async (directory: string) => {
			await mkdir(directory, { recursive: true });
		},
		serializeApp: serializeAppImpl = serializeApp,
		showError: showErrorImpl = showError,
		showSuccess: showSuccessImpl = showSuccess,
		writeFile: writeFileImpl = async (targetPath: string, contents: string) => {
			await writeFile(targetPath, contents, "utf8");
		},
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: ExecuteBuildDependencies = {},
): Promise<void> => {
	const quiet = options.quiet ?? false;
	const spinner = createSpinnerImpl({ json: options.json, quiet });

	try {
		const definition = await buildDefinitionImpl(cwd, quiet);
		const outputDirectory = path.resolve(
			cwd,
			options.output ?? DEFAULT_OUTPUT_DIRECTORY,
		);
		spinner.start("Preparing output directory...");
		await makeDirectory(outputDirectory);
		spinner.stop("Output directory ready");

		const artifactPath = path.join(
			outputDirectory,
			buildArtifactFilename(definition.id, definition.version),
		);
		spinner.start(`Writing ${path.basename(artifactPath)}...`);
		await writeFileImpl(artifactPath, serializeAppImpl(definition));
		spinner.stop("Build succeeded");

		const relativeArtifactPath = path.relative(cwd, artifactPath);
		if (options.json) {
			writeJsonSuccessImpl({
				appId: definition.id,
				artifactPath: relativeArtifactPath,
				version: definition.version,
			});
			return;
		}

		showSuccessImpl(`Build succeeded: ${filePath(relativeArtifactPath)}`, {
			quiet,
		});
	} catch (error) {
		const details = getPlayCommandErrorDetails(error);
		showErrorImpl(details.message, {
			exitCode: details.exitCode,
			json: options.json,
			suggestion: details.suggestion,
		});
	}
};
