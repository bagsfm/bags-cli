/**
 * `bags.toml` parsing and validation for Play project-aware commands.
 *
 * @packageDocumentation
 */

import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "smol-toml";

export const PLAY_PROJECT_CONFIG_FILE = "bags.toml";
export const DEFAULT_PLAY_RUNTIME = "bun";
export const DEFAULT_PLAY_PACKAGE_MANAGER = "bun";
export const SUPPORTED_PLAY_RUNTIMES = ["bun", "node"] as const;
export const SUPPORTED_PLAY_PACKAGE_MANAGERS = ["bun", "pnpm", "npm"] as const;

export interface ProjectConfig {
	entry: string;
	packageManager: (typeof SUPPORTED_PLAY_PACKAGE_MANAGERS)[number];
	runtime: (typeof SUPPORTED_PLAY_RUNTIMES)[number];
}

export interface ProjectOverrides {
	bagsApiUrl?: string;
	playApiUrl?: string;
}

interface ParsedProjectToml {
	bags_api?: unknown;
	entry?: unknown;
	package_manager?: unknown;
	play_api?: unknown;
	runtime?: unknown;
}

const readProjectToml = async (
	directory: string,
): Promise<ParsedProjectToml | null> => {
	try {
		return parse(
			await readFile(join(directory, PLAY_PROJECT_CONFIG_FILE), "utf8"),
		) as ParsedProjectToml;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return null;
		}

		throw error;
	}
};

const isSupportedRuntime = (
	value: string,
): value is (typeof SUPPORTED_PLAY_RUNTIMES)[number] => {
	return SUPPORTED_PLAY_RUNTIMES.includes(
		value as (typeof SUPPORTED_PLAY_RUNTIMES)[number],
	);
};

const isSupportedPackageManager = (
	value: string,
): value is (typeof SUPPORTED_PLAY_PACKAGE_MANAGERS)[number] => {
	return SUPPORTED_PLAY_PACKAGE_MANAGERS.includes(
		value as (typeof SUPPORTED_PLAY_PACKAGE_MANAGERS)[number],
	);
};

export const readProjectConfig = async (
	directory = process.cwd(),
): Promise<ProjectConfig> => {
	const parsedProjectConfig = await readProjectToml(directory);
	if (!parsedProjectConfig) {
		throw new Error(
			"No bags.toml found. Run `bags play init` to create a project.",
		);
	}

	if (
		typeof parsedProjectConfig.entry !== "string" ||
		parsedProjectConfig.entry.length === 0
	) {
		throw new Error("bags.toml must define an `entry` field.");
	}

	const runtime =
		typeof parsedProjectConfig.runtime === "string"
			? parsedProjectConfig.runtime
			: DEFAULT_PLAY_RUNTIME;
	if (!isSupportedRuntime(runtime)) {
		throw new Error(
			`Unsupported runtime "${runtime}". Supported runtimes: ${SUPPORTED_PLAY_RUNTIMES.join(", ")}.`,
		);
	}

	const packageManager =
		typeof parsedProjectConfig.package_manager === "string"
			? parsedProjectConfig.package_manager
			: DEFAULT_PLAY_PACKAGE_MANAGER;
	if (!isSupportedPackageManager(packageManager)) {
		throw new Error(
			`Unsupported package manager "${packageManager}". Supported package managers: ${SUPPORTED_PLAY_PACKAGE_MANAGERS.join(", ")}.`,
		);
	}

	return {
		entry: parsedProjectConfig.entry,
		packageManager,
		runtime,
	};
};

export const readProjectOverrides = async (
	directory = process.cwd(),
): Promise<ProjectOverrides> => {
	const parsedProjectConfig = await readProjectToml(directory);
	if (!parsedProjectConfig) {
		return {};
	}

	return {
		...(typeof parsedProjectConfig.bags_api === "string" &&
		parsedProjectConfig.bags_api.length > 0
			? { bagsApiUrl: parsedProjectConfig.bags_api }
			: {}),
		...(typeof parsedProjectConfig.play_api === "string" &&
		parsedProjectConfig.play_api.length > 0
			? { playApiUrl: parsedProjectConfig.play_api }
			: {}),
	};
};
