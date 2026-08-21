import { spawn } from "node:child_process";
import { access, constants, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { delimiter, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { PlayCommandError } from "./errors.js";
import { readStream } from "./read-stream.js";

const getBunCandidateNames = (
	platformName: NodeJS.Platform,
): readonly string[] => {
	return platformName === "win32"
		? ["bun.exe", "bun.cmd", "bun.bat", "bun"]
		: ["bun"];
};

const getPathEntries = (env: NodeJS.ProcessEnv): readonly string[] => {
	const pathValue = env.PATH;
	if (!pathValue) {
		return [];
	}

	return pathValue.split(delimiter).filter((entry) => entry.length > 0);
};

export const buildBunLoaderSource = (entryPath: string): string => {
	return [
		`import app from ${JSON.stringify(pathToFileURL(entryPath).href)};`,
		"console.log(JSON.stringify(app));",
	].join("\n");
};

export const findBun = async (
	env: NodeJS.ProcessEnv = process.env,
	platformName: NodeJS.Platform = process.platform,
): Promise<string | null> => {
	const accessMode =
		platformName === "win32" ? constants.F_OK : constants.F_OK | constants.X_OK;

	for (const directory of getPathEntries(env)) {
		for (const candidateName of getBunCandidateNames(platformName)) {
			const candidatePath = join(directory, candidateName);

			try {
				await access(candidatePath, accessMode);
				return candidatePath;
			} catch {}
		}
	}

	return null;
};

export const requireBunOnPath = async (
	commandLabel: string,
	env: NodeJS.ProcessEnv = process.env,
	platformName: NodeJS.Platform = process.platform,
): Promise<string> => {
	const bunPath = await findBun(env, platformName);
	if (bunPath) {
		return bunPath;
	}

	throw new PlayCommandError(`${commandLabel} requires Bun.`, {
		suggestion:
			"Install Bun from https://bun.sh/install, then re-run the command.",
	});
};

export interface ExecuteEntryFileWithBunDependencies {
	env?: NodeJS.ProcessEnv;
	makeTempDirectory?: typeof mkdtemp;
	removeDirectory?: typeof rm;
	requireBunOnPath?: typeof requireBunOnPath;
	spawnProcess?: typeof spawn;
	writeFile?: typeof writeFile;
}

export const executeEntryFileWithBun = async (
	entryPath: string,
	commandLabel: string,
	{
		env = process.env,
		makeTempDirectory = mkdtemp,
		removeDirectory = rm,
		requireBunOnPath: requireBunOnPathImpl = requireBunOnPath,
		spawnProcess = spawn,
		writeFile: writeFileImpl = writeFile,
	}: ExecuteEntryFileWithBunDependencies = {},
): Promise<string> => {
	const bunPath = await requireBunOnPathImpl(
		commandLabel,
		env,
		process.platform,
	);
	const tempDirectory = await makeTempDirectory(
		join(tmpdir(), "bags-play-bun-"),
	);
	const loaderPath = join(tempDirectory, "load-app.ts");

	try {
		await writeFileImpl(loaderPath, buildBunLoaderSource(entryPath), "utf8");

		const childProcess = spawnProcess(bunPath, ["run", loaderPath], {
			cwd: dirname(entryPath),
			env: {
				...env,
				NODE_ENV: "production",
			},
			stdio: ["ignore", "pipe", "pipe"],
		});

		const [stdout, stderr, exitCode] = await Promise.all([
			readStream(childProcess.stdout),
			readStream(childProcess.stderr),
			new Promise<number | null>((resolve, reject) => {
				childProcess.on("error", reject);
				childProcess.on("close", resolve);
			}),
		]);

		if (exitCode !== 0) {
			throw new Error(
				stderr.trim() || `Failed to execute ${entryPath} with Bun.`,
			);
		}

		return stdout.trim();
	} finally {
		await removeDirectory(tempDirectory, { force: true, recursive: true });
	}
};
