import { access } from "node:fs/promises";
import path from "node:path";
import {
	type AppValidationIssue,
	describeApp,
	deserializeApp,
	validateApp,
} from "@bagsfm/play-sdk/app-utils";
import type { AppDefinition } from "@bagsfm/play-shared";
import { readProjectConfig } from "../config/project.js";
import { executeEntryFileWithBun } from "./bun-runtime.js";
import { appRef, filePath, highlight } from "./colors.js";
import { PlayCommandError } from "./errors.js";
import { createSpinner, type PlaySpinner } from "./output.js";

export interface LoadValidatedAppDefinitionOptions {
	readonly commandLabel: string;
	readonly cwd?: string;
	readonly quiet?: boolean;
}

export interface LoadValidatedAppDefinitionDependencies {
	readonly createSpinner?: (options?: {
		json?: boolean;
		quiet?: boolean;
	}) => PlaySpinner;
	readonly describeApp?: typeof describeApp;
	readonly executeEntryFile?: (
		entryPath: string,
		runtime: string,
		commandLabel: string,
	) => Promise<AppDefinition>;
	readonly fileExists?: (path: string) => Promise<boolean>;
	readonly readProjectConfig?: typeof readProjectConfig;
	readonly validateApp?: typeof validateApp;
}

const fileExists = async (targetPath: string): Promise<boolean> => {
	try {
		await access(targetPath);
		return true;
	} catch {
		return false;
	}
};

const formatCount = (
	count: number,
	singular: string,
	plural = `${singular}s`,
): string => {
	return `${count} ${count === 1 ? singular : plural}`;
};

const formatTriggerLabel = (definition: AppDefinition): string => {
	if (
		definition.trigger.type === "cron" &&
		typeof definition.trigger.schedule === "string"
	) {
		return `cron: "${definition.trigger.schedule}"`;
	}

	return definition.trigger.type;
};

const formatValidationErrors = (
	issues: readonly AppValidationIssue[],
): string => {
	const details = issues
		.map((issue) => `- ${issue.path}: ${issue.message}`)
		.join("\n");
	return `App validation failed:\n${details}`;
};

const executeEntryFile = async (
	entryPath: string,
	runtime: string,
	commandLabel: string,
): Promise<AppDefinition> => {
	if (runtime !== "bun") {
		throw new PlayCommandError(
			'Only runtime = "bun" is currently supported. Install Bun and update your bags.toml.',
		);
	}

	const output = await executeEntryFileWithBun(entryPath, commandLabel);
	if (output.length === 0 || output === "undefined") {
		throw new PlayCommandError("Entry file did not export an AppDefinition.");
	}

	try {
		return deserializeApp(output);
	} catch (error) {
		throw new PlayCommandError(
			error instanceof Error
				? error.message
				: "Entry file did not export an AppDefinition.",
		);
	}
};

export const loadValidatedAppDefinition = async (
	{
		commandLabel,
		cwd = process.cwd(),
		quiet = false,
	}: LoadValidatedAppDefinitionOptions,
	{
		createSpinner: createSpinnerImpl = createSpinner,
		describeApp: describeAppImpl = describeApp,
		executeEntryFile: executeEntryFileImpl = executeEntryFile,
		fileExists: fileExistsImpl = fileExists,
		readProjectConfig: readProjectConfigImpl = readProjectConfig,
		validateApp: validateAppImpl = validateApp,
	}: LoadValidatedAppDefinitionDependencies = {},
): Promise<AppDefinition> => {
	const spinner = createSpinnerImpl({ quiet });

	try {
		spinner.start(`Loading ${filePath("bags.toml")}...`);
		const projectConfig = await readProjectConfigImpl(cwd);
		spinner.stop(`Loaded ${filePath("bags.toml")}`);

		const entryPath = path.resolve(cwd, projectConfig.entry);
		if (!(await fileExistsImpl(entryPath))) {
			spinner.fail("Entry file not found");
			throw new PlayCommandError(
				`Entry file not found: ${projectConfig.entry}`,
				{
					suggestion:
						"Update the `entry` field in bags.toml or create the entry file.",
				},
			);
		}

		spinner.start(`Executing ${filePath(path.basename(entryPath))}...`);
		const definition = await executeEntryFileImpl(
			entryPath,
			projectConfig.runtime,
			commandLabel,
		);
		const description = describeAppImpl(definition);
		spinner.stop(
			`Extracted AppDefinition - ${appRef(`${description.id}@${description.version}`)}`,
		);

		spinner.start("Validating schema...");
		const errors = validateAppImpl(definition).filter(
			(issue) => issue.severity === "error",
		);
		if (errors.length > 0) {
			spinner.fail("Validation failed");
			throw new PlayCommandError(formatValidationErrors(errors));
		}
		spinner.stop("Schema validated");

		spinner.start(
			`Validating interface (${highlight(formatCount(description.inputs.length, "input"))}, ${highlight(formatCount(description.outputs.length, "output"))})...`,
		);
		spinner.stop("Interface validated");
		spinner.start(
			`Validating nodes (${highlight(formatCount(description.nodeCount, "node"))})...`,
		);
		spinner.stop("Nodes validated");
		spinner.start(
			`Validating edges (${highlight(formatCount(description.edgeCount, "edge"))})...`,
		);
		spinner.stop("Edges validated");
		spinner.start(
			`Validating trigger (${highlight(formatTriggerLabel(definition))})...`,
		);
		spinner.stop("Trigger validated");

		return definition;
	} catch (error) {
		if (error instanceof PlayCommandError) {
			throw error;
		}

		spinner.fail("Build failed");
		throw new PlayCommandError(
			error instanceof Error
				? error.message
				: "Failed to build the Bags App artifact.",
		);
	}
};
