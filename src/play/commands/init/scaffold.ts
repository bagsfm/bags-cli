import { spawn } from "node:child_process";
import { access, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { readStream } from "../../utils/read-stream.js";
import type { ExecuteInitDependencies } from "./types.js";

type RunCommand = NonNullable<ExecuteInitDependencies["runCommand"]>;

const defaultFileExists = async (filePath: string): Promise<boolean> => {
	try {
		await access(filePath);
		return true;
	} catch {
		return false;
	}
};

const defaultRunCommand: RunCommand = async (command, args, directory) => {
	const childProcess = spawn(command, [...args], {
		cwd: directory,
		stdio: ["ignore", "ignore", "pipe"],
	});

	const [stderr, exitCode] = await Promise.all([
		readStream(childProcess.stderr),
		new Promise<number | null>((resolve, reject) => {
			childProcess.on("error", reject);
			childProcess.on("close", resolve);
		}),
	]);

	if (exitCode !== 0) {
		throw new Error(
			stderr.trim() || `Command failed: ${command} ${args.join(" ")}`,
		);
	}
};

export const writeProjectFiles = async (
	directory: string,
	files: ReadonlyMap<string, string>,
	{
		fileExists = defaultFileExists,
		makeDirectory = async (targetDirectory: string) => {
			await mkdir(targetDirectory, { recursive: true });
		},
		writeFile: writeFileImpl = async (filePath: string, contents: string) => {
			await writeFile(filePath, contents, "utf8");
		},
	}: Pick<
		ExecuteInitDependencies,
		"fileExists" | "makeDirectory" | "writeFile"
	> = {},
): Promise<{ overwrittenConfig: boolean }> => {
	await makeDirectory(directory);

	const configPath = path.join(directory, "bags.toml");
	const overwrittenConfig = await fileExists(configPath);

	for (const [relativePath, contents] of files) {
		const filePath = path.join(directory, relativePath);
		await makeDirectory(path.dirname(filePath));
		await writeFileImpl(filePath, contents);
	}

	return { overwrittenConfig };
};

export const initGitRepository = async (
	directory: string,
	{
		runCommand = defaultRunCommand,
	}: Pick<ExecuteInitDependencies, "runCommand"> = {},
): Promise<void> => {
	await runCommand("git", ["init"], directory);
};

export const installDependencies = async (
	directory: string,
	packageManager: "bun",
	{
		runCommand = defaultRunCommand,
	}: Pick<ExecuteInitDependencies, "runCommand"> = {},
): Promise<void> => {
	await runCommand(packageManager, ["install"], directory);
};
