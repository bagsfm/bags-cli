import { access, readdir } from "node:fs/promises";
import path from "node:path";
import type { Command } from "commander";
import { findBun } from "../../utils/bun-runtime.js";
import { cmd, filePath, sectionHeader } from "../../utils/colors.js";
import { wrapPlayAction } from "../../utils/command.js";
import { addExamplesAfter } from "../../utils/help.js";
import {
	createSpinner,
	showError,
	showSuccess,
	showWarning,
} from "../../utils/output.js";
import { collectInitOptions, defaultInitPrompts } from "./prompts.js";
import {
	initGitRepository,
	installDependencies,
	writeProjectFiles,
} from "./scaffold.js";
import { installSkills } from "./skills.js";
import { resolveProjectFiles } from "./templates.js";
import type {
	ExecuteInitDependencies,
	InitCommandOptions,
	InitOptions,
	InitPrompts,
} from "./types.js";

type ExecuteInitCommandDependencies = Pick<
	ExecuteInitDependencies,
	| "createSpinner"
	| "fileExists"
	| "findBun"
	| "initGitRepository"
	| "installDependencies"
	| "installSkills"
	| "listDirectoryEntries"
	| "prompts"
	| "showError"
	| "showSuccess"
	| "showWarning"
	| "writeProjectFiles"
> & {
	collectInitOptions?: typeof collectInitOptions;
	cwd?: string;
	resolveProjectFiles?: typeof resolveProjectFiles;
};

const defaultFileExists = async (filePath: string): Promise<boolean> => {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
};

const defaultListDirectoryEntries = async (
	directory: string,
): Promise<string[]> => {
	try {
		return await readdir(directory);
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return [];
		}

		throw error;
	}
};

const buildNextSteps = (
	relativeDirectory: string,
	options: InitOptions,
): string => {
	const nextSteps = [sectionHeader("Next steps:")];

	if (relativeDirectory !== ".") {
		nextSteps.push(`  cd ${filePath(relativeDirectory)}`);
	}
	if (options.noInstall) {
		nextSteps.push(`  ${cmd("bun install")}`);
	}
	if (options.projectType === "plugin") {
		nextSteps.push(`  ${cmd("bun test")}`);
		return nextSteps.join("\n");
	}

	nextSteps.push(`  ${cmd("bags play build")}`);
	if (options.includeTests) {
		nextSteps.push(`  ${cmd("bun test")}`);
	}

	return nextSteps.join("\n");
};

const PROJECT_TYPE_LABELS: Record<InitOptions["projectType"], string> = {
	app: "Bags App",
	plugin: "Plugin",
};

const shouldProceedWithConfigOverwrite = async (
	targetDirectory: string,
	prompts: InitPrompts,
	fileExists: (path: string) => Promise<boolean>,
): Promise<boolean> => {
	const configPath = path.join(targetDirectory, "bags.toml");
	if (!(await fileExists(configPath))) {
		return true;
	}

	const overwrite = await prompts.confirm({
		active: "Overwrite",
		inactive: "Cancel",
		initialValue: false,
		message: "A bags.toml file already exists. Overwrite it?",
	});

	return !(prompts.isCancel(overwrite) || !overwrite);
};

const maybeInstallDependencies = async (
	targetDirectory: string,
	options: InitOptions,
	bunPath: string | null,
	spinner: ReturnType<typeof createSpinner>,
	installDependenciesImpl: typeof installDependencies,
	showWarningImpl: typeof showWarning,
): Promise<void> => {
	if (options.noInstall) {
		return;
	}
	if (!bunPath) {
		showWarningImpl(
			"Skipping dependency installation because Bun is not on PATH. Run `bun install` manually after installing Bun.",
			{ quiet: options.quiet },
		);
		return;
	}

	spinner.start("Installing dependencies with bun...");
	await installDependenciesImpl(targetDirectory, options.packageManager);
	spinner.stop("Installed dependencies");
};

const maybeInstallSkills = async (
	targetDirectory: string,
	options: InitOptions,
	bunPath: string | null,
	spinner: ReturnType<typeof createSpinner>,
	installSkillsImpl: typeof installSkills,
	showWarningImpl: typeof showWarning,
): Promise<void> => {
	if (options.skillsToInstall.length === 0) {
		return;
	}
	if (!bunPath) {
		showWarningImpl(
			`Skipping AI agent skill installation because Bun is not on PATH. Run \`bunx skills add ${options.skillsRepo} --skill '*' --agent '*' -y\` manually after installing Bun.`,
			{ quiet: options.quiet },
		);
		return;
	}

	spinner.start("Installing AI agent skills...");
	try {
		await installSkillsImpl(
			options.skillsRepo,
			options.skillsToInstall,
			targetDirectory,
		);
		spinner.stop("Installed AI agent skills");
	} catch (error) {
		spinner.stop("AI agent skills install skipped");
		showWarningImpl(
			`Skills were not installed automatically: ${error instanceof Error ? error.message : "Unknown error"}. Run \`bunx skills add ${options.skillsRepo} --skill '*' --agent '*' -y\` manually in the project directory.`,
			{ quiet: options.quiet },
		);
	}
};

export const executeInit = async (
	directory: string | undefined,
	options: InitCommandOptions,
	{
		collectInitOptions: collectInitOptionsImpl = collectInitOptions,
		createSpinner: createSpinnerImpl = createSpinner,
		cwd = process.cwd(),
		fileExists: fileExistsImpl = defaultFileExists,
		findBun: findBunImpl = findBun,
		initGitRepository: initGitRepositoryImpl = initGitRepository,
		installDependencies: installDependenciesImpl = installDependencies,
		installSkills: installSkillsImpl = installSkills,
		listDirectoryEntries:
			listDirectoryEntriesImpl = defaultListDirectoryEntries,
		prompts = defaultInitPrompts,
		resolveProjectFiles: resolveProjectFilesImpl = resolveProjectFiles,
		showError: showErrorImpl = showError,
		showSuccess: showSuccessImpl = showSuccess,
		showWarning: showWarningImpl = showWarning,
		writeProjectFiles: writeProjectFilesImpl = writeProjectFiles,
	}: ExecuteInitCommandDependencies = {},
): Promise<void> => {
	if (options.json) {
		showErrorImpl(
			"`bags play init` is interactive and cannot be used with `--json`.",
			{
				exitCode: 1,
				suggestion: "Omit `--json` for interactive scaffolding.",
			},
		);
		return;
	}

	try {
		const resolvedOptions = await collectInitOptionsImpl(directory, options, {
			prompts,
			skillsListWorkingDirectory: cwd,
		});
		if (!resolvedOptions) {
			return;
		}

		const targetDirectory = path.resolve(cwd, directory ?? ".");
		const relativeDirectory = path.relative(cwd, targetDirectory) || ".";
		const existingEntries = await listDirectoryEntriesImpl(targetDirectory);
		if (existingEntries.length > 0) {
			showWarningImpl(
				"Target directory already contains files. Scaffold files will be written alongside the existing contents.",
				{ quiet: resolvedOptions.quiet },
			);
		}

		if (resolvedOptions.projectType === "app") {
			const proceed = await shouldProceedWithConfigOverwrite(
				targetDirectory,
				prompts,
				fileExistsImpl,
			);
			if (!proceed) {
				return;
			}
		}

		const files = await resolveProjectFilesImpl(resolvedOptions);
		await writeProjectFilesImpl(targetDirectory, files);

		const spinner = createSpinnerImpl({ quiet: resolvedOptions.quiet });
		const bunPath = await findBunImpl();

		if (!resolvedOptions.noGit) {
			spinner.start("Initializing git repository...");
			await initGitRepositoryImpl(targetDirectory);
			spinner.stop("Initialized git repository");
		}

		await maybeInstallDependencies(
			targetDirectory,
			resolvedOptions,
			bunPath,
			spinner,
			installDependenciesImpl,
			showWarningImpl,
		);
		await maybeInstallSkills(
			targetDirectory,
			resolvedOptions,
			bunPath,
			spinner,
			installSkillsImpl,
			showWarningImpl,
		);

		showSuccessImpl(
			`Scaffolded ${PROJECT_TYPE_LABELS[resolvedOptions.projectType]} in ${filePath(relativeDirectory)}`,
			{ quiet: resolvedOptions.quiet },
		);
		if (!resolvedOptions.quiet) {
			prompts.outro(buildNextSteps(relativeDirectory, resolvedOptions));
		}
	} catch (error) {
		showErrorImpl(
			error instanceof Error
				? error.message
				: "Failed to scaffold the project.",
		);
	}
};

export const registerInitCommand = (parent: Command): void => {
	const command = parent
		.command("init")
		.argument("[directory]", "target directory")
		.description("Scaffold a new Play App or plugin")
		.option("--app", "skip the project type prompt and create an App")
		.option("--plugin", "skip the project type prompt and scaffold a Plugin")
		.option("--name <name>", "App or plugin identifier")
		.option("--no-test", "Skip test scaffolding")
		.option("--no-skills", "Skip installing AI agent skills (bunx skills)")
		.option(
			"--skills-repo <repo>",
			"GitHub shorthand or URL for the skills package",
			"bagsfm/play-skills",
		)
		.option("--no-git", "Skip git initialization")
		.option("--no-install", "Skip dependency installation")
		.action(
			wrapPlayAction(async (commandContext, targetDirectory?: string) => {
				const globalOptions =
					commandContext.optsWithGlobals<InitCommandOptions>();
				const localOptions = commandContext.opts<{
					app?: boolean;
					git: boolean;
					install: boolean;
					name?: string;
					plugin?: boolean;
					skills: boolean;
					skillsRepo: string;
					test: boolean;
				}>();

				await executeInit(targetDirectory, {
					...globalOptions,
					app: localOptions.app,
					name: localOptions.name,
					noGit: localOptions.git === false,
					noInstall: localOptions.install === false,
					noSkills: localOptions.skills === false,
					noTest: localOptions.test === false,
					plugin: localOptions.plugin,
					skillsRepo: localOptions.skillsRepo,
				});
			}),
		);

	addExamplesAfter(command, [
		{ command: "bags play init" },
		{
			description: "Scaffold an App project",
			command: "bags play init --app --name fee-compounder",
		},
		{
			description: "Scaffold a plugin project",
			command: "bags play init --plugin --name price-alerts",
		},
	]);
};
