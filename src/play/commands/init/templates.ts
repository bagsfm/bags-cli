import path from "node:path";
import {
	EMBEDDED_PLAY_SDK_VERSION,
	EMBEDDED_TEMPLATES,
} from "../../templates/embedded.js";
import {
	INIT_BUN_TYPES_VERSION,
	INIT_TYPESCRIPT_VERSION,
} from "./tool-versions.js";
import type {
	InitOptions,
	InitTemplateVariables,
	ResolveProjectFilesDependencies,
} from "./types.js";

const PLACEHOLDER_PATTERN = /\{\{([A-Z0-9_]+)\}\}/g;

const titleCaseFromKebabCase = (value: string): string => {
	return value
		.split("-")
		.filter((segment) => segment.length > 0)
		.map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
		.join(" ");
};

const toPascalCase = (value: string): string => {
	return value
		.split("-")
		.filter((segment) => segment.length > 0)
		.map((segment) => `${segment[0]?.toUpperCase() ?? ""}${segment.slice(1)}`)
		.join("");
};

const createTemplateVariables = (
	options: InitOptions,
): InitTemplateVariables => {
	const isPlugin = options.projectType === "plugin";

	return {
		APP_DISPLAY_NAME: isPlugin ? "" : titleCaseFromKebabCase(options.appName),
		APP_NAME: isPlugin ? "" : options.appName,
		BUN_TYPES_VERSION: INIT_BUN_TYPES_VERSION,
		PLAY_SDK_VERSION: EMBEDDED_PLAY_SDK_VERSION,
		PLUGIN_AUTHOR: options.pluginAuthor ?? "",
		PLUGIN_CATEGORY: options.pluginCategory ?? "",
		PLUGIN_CONFIG_TYPE: isPlugin
			? `${toPascalCase(options.appName)}PluginConfig`
			: "",
		PLUGIN_DESCRIPTION: options.pluginDescription ?? "",
		PLUGIN_ID: isPlugin ? options.appName : "",
		PLUGIN_NAME: options.pluginName ?? "",
		PLUGIN_PACKAGE_NAME: isPlugin ? `bags-play-${options.appName}-plugin` : "",
		TYPESCRIPT_VERSION: INIT_TYPESCRIPT_VERSION,
	};
};

const getTemplateLayerPrefixes = (options: InitOptions): readonly string[] => {
	if (options.projectType === "plugin") {
		return ["plugin/base/"];
	}

	return options.includeTests
		? ["app/base/", "app/with-tests/"]
		: ["app/base/"];
};

const collectTemplateLayer = (
	prefix: string,
	embeddedTemplates: ReadonlyMap<string, string>,
): Map<string, string> => {
	const files = new Map<string, string>();

	for (const [relativePath, contents] of embeddedTemplates) {
		if (!relativePath.startsWith(prefix)) {
			continue;
		}

		files.set(relativePath.slice(prefix.length), contents);
	}

	if (files.size === 0) {
		throw new Error(`Missing embedded template layer: ${prefix}`);
	}

	return files;
};

const renameTemplatePathSegment = (segment: string): string => {
	if (segment === "gitignore") {
		return ".gitignore";
	}

	if (segment.startsWith("_")) {
		return `.${segment.slice(1)}`;
	}

	if (segment.endsWith(".tmpl")) {
		return segment.slice(0, -".tmpl".length);
	}

	return segment;
};

const renameTemplatePath = (relativePath: string): string => {
	return relativePath.split("/").map(renameTemplatePathSegment).join("/");
};

const replaceTemplatePlaceholders = (
	relativePath: string,
	contents: string,
	variables: InitTemplateVariables,
): string => {
	return contents.replace(
		PLACEHOLDER_PATTERN,
		(placeholder, variableName: keyof InitTemplateVariables) => {
			const value = variables[variableName];
			if (typeof value !== "string") {
				throw new Error(
					`Unsupported template placeholder ${placeholder} in ${relativePath}`,
				);
			}

			return value;
		},
	);
};

const stripEmptyStringObjectValues = (value: unknown): unknown => {
	if (Array.isArray(value)) {
		return value
			.map((item) => stripEmptyStringObjectValues(item))
			.filter((item) => item !== undefined);
	}

	if (value && typeof value === "object") {
		return Object.fromEntries(
			Object.entries(value)
				.map(([key, nestedValue]) => [
					key,
					stripEmptyStringObjectValues(nestedValue),
				])
				.filter(([, nestedValue]) => nestedValue !== ""),
		);
	}

	return value;
};

const normalizeTemplateFileContents = (
	relativePath: string,
	contents: string,
): string => {
	if (path.posix.basename(relativePath) !== "package.json") {
		return contents;
	}

	return JSON.stringify(
		stripEmptyStringObjectValues(JSON.parse(contents)),
		null,
		2,
	);
};

export const resolveProjectFiles = async (
	options: InitOptions,
	{
		embeddedTemplates = EMBEDDED_TEMPLATES,
	}: ResolveProjectFilesDependencies = {},
): Promise<Map<string, string>> => {
	const files = new Map<string, string>();
	const templateVariables = createTemplateVariables(options);

	for (const layerPrefix of getTemplateLayerPrefixes(options)) {
		const templateFiles = collectTemplateLayer(layerPrefix, embeddedTemplates);

		for (const [relativePath, contents] of templateFiles) {
			const renamedPath = renameTemplatePath(relativePath);
			const resolvedContents = replaceTemplatePlaceholders(
				renamedPath,
				contents,
				templateVariables,
			);

			files.set(
				renamedPath,
				normalizeTemplateFileContents(renamedPath, resolvedContents),
			);
		}
	}

	return files;
};
