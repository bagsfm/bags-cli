import {
	checkbox,
	input,
	confirm as inquirerConfirm,
	select as inquirerSelect,
} from "@inquirer/prompts";
import { sectionHeader } from "../../utils/colors.js";
import { listAvailableSkills as defaultListAvailableSkills } from "./skills.js";
import type {
	InitCommandOptions,
	InitOptions,
	InitPluginCategory,
	InitPrompts,
	ListedSkill,
	PromptSelectChoice,
} from "./types.js";

const APP_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const CANCELLED_PROMPT = Symbol("bags-play-init-cancelled");
const CANCEL_MESSAGE = "Project initialization cancelled.";
const DEFAULT_SKILLS_REPO = "bagsfm/play-skills";

const isPromptExitError = (error: unknown): boolean => {
	return error instanceof Error && error.name === "ExitPromptError";
};

const runPrompt = async <T>(fn: () => Promise<T>): Promise<T | symbol> => {
	try {
		return await fn();
	} catch (error) {
		if (isPromptExitError(error)) {
			return CANCELLED_PROMPT;
		}

		throw error;
	}
};

const toChoices = <Value extends string>(
	options: readonly PromptSelectChoice<Value>[],
): Array<{ name: string; value: Value }> => {
	return options.map((option) => ({
		name: option.hint ? `${option.label} - ${option.hint}` : option.label,
		value: option.value,
	}));
};

export const defaultInitPrompts: InitPrompts = {
	cancel(message) {
		console.log(message ?? "");
	},
	confirm(options) {
		return runPrompt(() =>
			inquirerConfirm({
				default: options.initialValue ?? options.default,
				message: options.message,
			}),
		);
	},
	intro(message) {
		console.log(message ?? "");
	},
	isCancel(value): value is symbol {
		return value === CANCELLED_PROMPT;
	},
	message(message) {
		if (Array.isArray(message)) {
			console.log(message.join("\n"));
			return;
		}

		console.log(message ?? "");
	},
	multiselect(options) {
		return runPrompt(() =>
			checkbox({
				choices: toChoices(options.options).map((choice) => ({
					...choice,
					checked: options.initialValues?.includes(choice.value) ?? false,
				})),
				message: options.message,
				required: options.required,
			}),
		);
	},
	outro(message) {
		console.log(message ?? "");
	},
	select(options) {
		return runPrompt(() =>
			inquirerSelect({
				choices: toChoices(options.options),
				message: options.message,
			}),
		);
	},
	text(options) {
		return runPrompt(() =>
			input({
				default: options.initialValue,
				message: options.message,
				validate: options.validate
					? (value) => options.validate?.(value) ?? true
					: undefined,
			}),
		);
	},
};

export const validateAppName = (value: string): string | undefined => {
	return APP_NAME_PATTERN.test(value)
		? undefined
		: "Use kebab-case with lowercase letters, numbers, and hyphens only.";
};

const cancelPromptFlow = (prompts: InitPrompts): null => {
	prompts.cancel(CANCEL_MESSAGE);
	return null;
};

const hasExplicitProjectType = (options: InitCommandOptions): boolean => {
	return options.app === true || options.plugin === true;
};

const isHeadlessMode = (options: InitCommandOptions): boolean => {
	return hasExplicitProjectType(options) && typeof options.name === "string";
};

const resolveSkillsRepo = (options: InitCommandOptions): string => {
	const trimmed = options.skillsRepo?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_SKILLS_REPO;
};

const resolveProjectType = async (
	options: InitCommandOptions,
	prompts: InitPrompts,
): Promise<InitOptions["projectType"] | null> => {
	if (options.plugin) {
		return "plugin";
	}
	if (options.app) {
		return "app";
	}

	const projectType = await prompts.select<InitOptions["projectType"]>({
		message: "What would you like to create?",
		options: [
			{ hint: "recommended", label: "App", value: "app" },
			{ label: "Plugin", value: "plugin" },
		],
	});

	return prompts.isCancel(projectType)
		? cancelPromptFlow(prompts)
		: projectType;
};

const resolveAppName = async (
	directory: string | undefined,
	options: InitCommandOptions,
	prompts: InitPrompts,
): Promise<string | null> => {
	if (options.name) {
		if (validateAppName(options.name)) {
			throw new Error("App name must use kebab-case.");
		}

		return options.name;
	}

	const appName = await prompts.text({
		initialValue:
			directory && APP_NAME_PATTERN.test(directory) ? directory : undefined,
		message: "App name",
		placeholder: "fee-compounder",
		validate: (value) => validateAppName(value ?? ""),
	});

	return prompts.isCancel(appName) ? cancelPromptFlow(prompts) : appName;
};

const resolveIncludeTests = async (
	headless: boolean,
	options: InitCommandOptions,
	prompts: InitPrompts,
): Promise<boolean | null> => {
	if (options.noTest) {
		return false;
	}
	if (headless) {
		return true;
	}

	const includeTests = await prompts.confirm({
		active: "Yes (bun test) (recommended)",
		inactive: "No",
		initialValue: true,
		message: "Include test scaffolding?",
	});

	return prompts.isCancel(includeTests)
		? cancelPromptFlow(prompts)
		: includeTests;
};

const resolveSkillsToInstall = async (
	headless: boolean,
	options: InitCommandOptions,
	skillsRepo: string,
	skillsListWorkingDirectory: string,
	prompts: InitPrompts,
	listAvailableSkillsImpl: typeof defaultListAvailableSkills,
): Promise<readonly string[] | null> => {
	if (options.noSkills) {
		return [];
	}
	if (headless) {
		return ["*"];
	}

	const listed = await listAvailableSkillsImpl(
		skillsRepo,
		skillsListWorkingDirectory,
	);
	if (!listed.ok) {
		prompts.message(`Skipping skills install: ${listed.message}`);
		return [];
	}
	if (listed.skills.length === 0) {
		prompts.message(
			"No skills found in the repository; skipping skills install.",
		);
		return [];
	}

	const selected = await prompts.multiselect<string>({
		initialValues: listed.skills.map((skill) => skill.name),
		message: "Which AI agent skills should be installed?",
		options: listed.skills.map((skill: ListedSkill) => ({
			hint: "recommended",
			label: skill.description
				? `${skill.name} — ${skill.description}`
				: skill.name,
			value: skill.name,
		})),
		required: false,
	});

	return prompts.isCancel(selected) ? cancelPromptFlow(prompts) : selected;
};

const resolvePluginTextField = async (
	prompts: InitPrompts,
	message: string,
	placeholder: string,
	defaultValue = "",
): Promise<string | null> => {
	const value = await prompts.text({ message, placeholder });
	if (prompts.isCancel(value)) {
		return cancelPromptFlow(prompts);
	}

	return value || defaultValue;
};

const collectPluginOptions = async (
	directory: string | undefined,
	options: InitCommandOptions,
	headless: boolean,
	prompts: InitPrompts,
	listAvailableSkillsImpl: typeof defaultListAvailableSkills,
	skillsListWorkingDirectory: string,
): Promise<InitOptions | null> => {
	const pluginId = await resolveAppName(directory, options, prompts);
	if (!pluginId) {
		return null;
	}

	const pluginName = await resolvePluginTextField(
		prompts,
		"Plugin name",
		"My Plugin",
	);
	const pluginDescription = await resolvePluginTextField(
		prompts,
		"Description",
		"A Bags Play plugin",
		"A Bags Play plugin",
	);
	const pluginAuthor = await resolvePluginTextField(
		prompts,
		"Author",
		"Your Name",
	);
	if (
		pluginName === null ||
		pluginDescription === null ||
		pluginAuthor === null
	) {
		return null;
	}

	const pluginCategory = await prompts.select<InitPluginCategory>({
		message: "Category",
		options: [
			{ label: "Official", value: "official" },
			{ label: "Community", value: "community" },
		],
	});
	if (prompts.isCancel(pluginCategory)) {
		return cancelPromptFlow(prompts);
	}

	const skillsRepo = resolveSkillsRepo(options);
	const skillsToInstall = await resolveSkillsToInstall(
		headless,
		options,
		skillsRepo,
		skillsListWorkingDirectory,
		prompts,
		listAvailableSkillsImpl,
	);
	if (skillsToInstall === null) {
		return null;
	}

	return {
		appName: pluginId,
		directory,
		includeTests: false,
		noGit: options.noGit ?? false,
		noInstall: options.noInstall ?? false,
		packageManager: "bun",
		pluginAuthor,
		pluginCategory,
		pluginDescription,
		pluginName,
		projectType: "plugin",
		quiet: options.quiet ?? false,
		skillsRepo,
		skillsToInstall,
	};
};

const collectAppOptions = async (
	directory: string | undefined,
	options: InitCommandOptions,
	headless: boolean,
	prompts: InitPrompts,
	listAvailableSkillsImpl: typeof defaultListAvailableSkills,
	skillsListWorkingDirectory: string,
): Promise<InitOptions | null> => {
	const appName = await resolveAppName(directory, options, prompts);
	if (!appName) {
		return null;
	}

	const includeTests = await resolveIncludeTests(headless, options, prompts);
	if (includeTests === null) {
		return null;
	}

	const skillsRepo = resolveSkillsRepo(options);
	const skillsToInstall = await resolveSkillsToInstall(
		headless,
		options,
		skillsRepo,
		skillsListWorkingDirectory,
		prompts,
		listAvailableSkillsImpl,
	);
	if (skillsToInstall === null) {
		return null;
	}

	return {
		appName,
		directory,
		includeTests,
		noGit: options.noGit ?? false,
		noInstall: options.noInstall ?? false,
		packageManager: "bun",
		projectType: "app",
		quiet: options.quiet ?? false,
		skillsRepo,
		skillsToInstall,
	};
};

export interface CollectInitOptionsDependencies {
	listAvailableSkills?: typeof defaultListAvailableSkills;
	prompts?: InitPrompts;
	skillsListWorkingDirectory?: string;
}

export const collectInitOptions = async (
	directory: string | undefined,
	options: InitCommandOptions,
	{
		listAvailableSkills: listAvailableSkillsImpl = defaultListAvailableSkills,
		prompts = defaultInitPrompts,
		skillsListWorkingDirectory = process.cwd(),
	}: CollectInitOptionsDependencies = {},
): Promise<InitOptions | null> => {
	const headless = isHeadlessMode(options);
	if (!headless && options.quiet !== true) {
		prompts.intro(sectionHeader("Bags Play project scaffolding"));
	}

	const projectType = await resolveProjectType(options, prompts);
	if (!projectType) {
		return null;
	}

	return projectType === "plugin"
		? await collectPluginOptions(
				directory,
				options,
				headless,
				prompts,
				listAvailableSkillsImpl,
				skillsListWorkingDirectory,
			)
		: await collectAppOptions(
				directory,
				options,
				headless,
				prompts,
				listAvailableSkillsImpl,
				skillsListWorkingDirectory,
			);
};
