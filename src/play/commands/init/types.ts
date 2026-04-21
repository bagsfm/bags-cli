import type { PlaySpinner } from "../../utils/output.js";

export type InitProjectType = "app" | "plugin";
export type InitPluginCategory = "official" | "community";

export interface InitCommandOptions {
	app?: boolean;
	color?: boolean;
	json?: boolean;
	name?: string;
	noGit?: boolean;
	noInstall?: boolean;
	noSkills?: boolean;
	noTest?: boolean;
	plugin?: boolean;
	quiet?: boolean;
	skillsRepo?: string;
}

export interface ListedSkill {
	readonly description: string;
	readonly name: string;
}

export interface InitOptions {
	appName: string;
	directory?: string;
	includeTests: boolean;
	noGit: boolean;
	noInstall: boolean;
	packageManager: "bun";
	pluginAuthor?: string;
	pluginCategory?: InitPluginCategory;
	pluginDescription?: string;
	pluginName?: string;
	projectType: InitProjectType;
	quiet: boolean;
	skillsRepo: string;
	skillsToInstall: readonly string[];
}

export type InitTemplateVariableName =
	| "APP_DISPLAY_NAME"
	| "APP_NAME"
	| "BUN_TYPES_VERSION"
	| "PLAY_SDK_VERSION"
	| "PLUGIN_AUTHOR"
	| "PLUGIN_CATEGORY"
	| "PLUGIN_CONFIG_TYPE"
	| "PLUGIN_DESCRIPTION"
	| "PLUGIN_ID"
	| "PLUGIN_NAME"
	| "PLUGIN_PACKAGE_NAME"
	| "TYPESCRIPT_VERSION";

export type InitTemplateVariables = Record<InitTemplateVariableName, string>;

export interface PromptSelectChoice<Value extends string> {
	readonly hint?: string;
	readonly label: string;
	readonly value: Value;
}

export interface InitPrompts {
	cancel(message?: string): void;
	confirm(options: {
		active?: string;
		default?: boolean;
		inactive?: string;
		initialValue?: boolean;
		message: string;
	}): Promise<boolean | symbol>;
	intro(message?: string): void;
	isCancel(value: unknown): value is symbol;
	message(message?: string | string[]): void;
	multiselect<Value extends string>(options: {
		initialValues?: readonly Value[];
		message: string;
		options: readonly PromptSelectChoice<Value>[];
		required?: boolean;
	}): Promise<readonly Value[] | symbol>;
	outro(message?: string): void;
	select<Value extends string>(options: {
		message: string;
		options: readonly PromptSelectChoice<Value>[];
	}): Promise<Value | symbol>;
	text(options: {
		initialValue?: string;
		message: string;
		placeholder?: string;
		validate?: (value: string) => string | undefined;
	}): Promise<string | symbol>;
}

export interface ExecuteInitDependencies {
	createSpinner?: (options?: { quiet?: boolean }) => PlaySpinner;
	fileExists?: (path: string) => Promise<boolean>;
	findBun?: () => Promise<string | null>;
	initGitRepository?: (directory: string) => Promise<void>;
	installDependencies?: (
		directory: string,
		packageManager: InitOptions["packageManager"],
	) => Promise<void>;
	installSkills?: (
		skillsRepo: string,
		skillNames: readonly string[],
		directory: string,
	) => Promise<void>;
	listDirectoryEntries?: (directory: string) => Promise<string[]>;
	makeDirectory?: (directory: string) => Promise<void>;
	prompts?: InitPrompts;
	runCommand?: (
		command: string,
		args: readonly string[],
		directory: string,
	) => Promise<void>;
	showError?: (
		message: string,
		options?: { exitCode?: number; suggestion?: string },
	) => void;
	showSuccess?: (message: string, options?: { quiet?: boolean }) => void;
	showWarning?: (message: string, options?: { quiet?: boolean }) => void;
	writeFile?: (path: string, contents: string) => Promise<void>;
	writeProjectFiles?: (
		directory: string,
		files: ReadonlyMap<string, string>,
	) => Promise<{ overwrittenConfig: boolean }>;
}

export interface ResolveProjectFilesDependencies {
	readonly embeddedTemplates?: ReadonlyMap<string, string>;
}
