import { describe, expect, mock, test } from "bun:test";
import { executeInit } from "../../../src/play/commands/init/index.ts";
import type {
	InitOptions,
	InitPrompts,
} from "../../../src/play/commands/init/types.ts";
import {
	cmd,
	filePath,
	sectionHeader,
} from "../../../src/play/utils/colors.ts";

const createPromptsMock = (): InitPrompts => {
	return {
		cancel: mock(() => undefined),
		confirm: mock(async () => true),
		intro: mock(() => undefined),
		isCancel: (value: unknown): value is symbol => typeof value === "symbol",
		message: mock(() => undefined),
		multiselect: mock(<Value>() =>
			Promise.resolve([] as Value[]),
		) as InitPrompts["multiselect"],
		outro: mock(() => undefined),
		select: mock(<Value>() =>
			Promise.resolve("app" as Value),
		) as InitPrompts["select"],
		text: mock(async () => "fee-compounder"),
	};
};

const createSpinnerMock = () => {
	return {
		fail: mock(() => undefined),
		isSpinning: false,
		message: mock(() => undefined),
		start: mock(() => undefined),
		stop: mock(() => undefined),
	};
};

const INIT_OPTIONS: InitOptions = {
	appName: "fee-compounder",
	directory: "fee-compounder",
	includeTests: true,
	noGit: false,
	noInstall: false,
	packageManager: "bun",
	projectType: "app",
	quiet: false,
	skillsRepo: "bagsfm/play-skills",
	skillsToInstall: [],
};

const createDependencies = () => {
	const prompts = createPromptsMock();
	const spinner = createSpinnerMock();
	const resolvedFiles = new Map([
		["app.ts", "export default {};"],
		["bags.toml", 'entry = "app.ts"'],
	]);

	return {
		collectInitOptions: mock(
			async (): Promise<InitOptions | null> => INIT_OPTIONS,
		),
		createSpinner: mock(() => spinner),
		cwd: "/tmp/workspace",
		fileExists: mock(async () => false),
		findBun: mock(async () => "/usr/local/bin/bun"),
		initGitRepository: mock(async () => undefined),
		installDependencies: mock(async () => undefined),
		installSkills: mock(async () => undefined),
		listDirectoryEntries: mock(async (): Promise<string[]> => []),
		prompts,
		resolveProjectFiles: mock(async () => resolvedFiles),
		resolvedFiles,
		showError: mock(() => undefined),
		showSuccess: mock(() => undefined),
		spinner,
		showWarning: mock(() => undefined),
		writeProjectFiles: mock(async () => ({ overwrittenConfig: false })),
	};
};

describe.concurrent("executeInit", () => {
	test.concurrent("rejects --json as unsupported", async () => {
		const deps = createDependencies();

		await executeInit(undefined, { json: true }, deps);

		expect(deps.showError).toHaveBeenCalledWith(
			"`bags play init` is interactive and cannot be used with `--json`.",
			{
				exitCode: 1,
				suggestion: "Omit `--json` for interactive scaffolding.",
			},
		);
		expect(deps.collectInitOptions).not.toHaveBeenCalled();
	});

	test.concurrent("scaffolds files, initializes git, installs dependencies, and reports next steps", async () => {
		const deps = createDependencies();

		await executeInit("fee-compounder", {}, deps);

		expect(deps.collectInitOptions).toHaveBeenCalledWith(
			"fee-compounder",
			{},
			{
				prompts: deps.prompts,
				skillsListWorkingDirectory: "/tmp/workspace",
			},
		);
		expect(deps.listDirectoryEntries).toHaveBeenCalledWith(
			"/tmp/workspace/fee-compounder",
		);
		expect(deps.resolveProjectFiles).toHaveBeenCalledWith(INIT_OPTIONS);
		expect(deps.writeProjectFiles).toHaveBeenCalledWith(
			"/tmp/workspace/fee-compounder",
			deps.resolvedFiles,
		);
		expect(deps.initGitRepository).toHaveBeenCalledWith(
			"/tmp/workspace/fee-compounder",
		);
		expect(deps.installDependencies).toHaveBeenCalledWith(
			"/tmp/workspace/fee-compounder",
			"bun",
		);
		expect(deps.showSuccess).toHaveBeenCalledWith(
			`Scaffolded Bags App in ${filePath("fee-compounder")}`,
			{
				quiet: false,
			},
		);
		expect(deps.prompts.outro).toHaveBeenCalledWith(
			[
				sectionHeader("Next steps:"),
				`  cd ${filePath("fee-compounder")}`,
				`  ${cmd("bags play build")}`,
				`  ${cmd("bun test")}`,
			].join("\n"),
		);
	});
});
