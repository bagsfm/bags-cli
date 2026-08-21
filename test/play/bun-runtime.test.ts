import { afterEach, expect, test } from "bun:test";
import { EventEmitter } from "node:events";
import { chmod, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PassThrough } from "node:stream";
import { pathToFileURL } from "node:url";
import {
	buildBunLoaderSource,
	executeEntryFileWithBun,
	findBun,
	requireBunOnPath,
} from "../../src/play/utils/bun-runtime.ts";
import { PlayCommandError } from "../../src/play/utils/errors.ts";
import { TEST_APP } from "./helpers.ts";

const tempDirectories: string[] = [];

const createTempDirectory = async (): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), "bags-cli-play-bun-"));
	tempDirectories.push(directory);
	return directory;
};

const createExecutable = async (
	directory: string,
	name: string,
): Promise<string> => {
	const executablePath = join(directory, name);
	await writeFile(executablePath, "#!/bin/sh\nexit 0\n", "utf8");
	await chmod(executablePath, 0o755);
	return executablePath;
};

afterEach(async () => {
	await Promise.all(
		tempDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

test("findBun returns the bun executable from PATH", async () => {
	const directory = await createTempDirectory();
	const bunPath = await createExecutable(directory, "bun");

	await expect(findBun({ PATH: directory }, "linux")).resolves.toBe(bunPath);
});

test("requireBunOnPath throws a helpful PlayCommandError when bun is missing", async () => {
	try {
		await requireBunOnPath("bags play info", { PATH: "" }, "linux");
		throw new Error("Expected requireBunOnPath to throw");
	} catch (error) {
		expect(error).toBeInstanceOf(PlayCommandError);
		expect(error).toMatchObject({
			message: "bags play info requires Bun.",
			suggestion: expect.stringContaining("https://bun.sh/install"),
		});
	}
});

test("buildBunLoaderSource imports the entry file URL and prints JSON", () => {
	const entryPath = "/tmp/example-app.ts";
	const loaderSource = buildBunLoaderSource(entryPath);

	expect(loaderSource).toContain(JSON.stringify(pathToFileURL(entryPath).href));
	expect(loaderSource).toContain("console.log(JSON.stringify(app));");
});

test("executeEntryFileWithBun forces NODE_ENV=production in the Bun subprocess", async () => {
	let seenEnv: NodeJS.ProcessEnv | undefined;
	const spawnProcess = (_command, _args, options) => {
		seenEnv = options?.env as NodeJS.ProcessEnv | undefined;

		const stdout = new PassThrough();
		const stderr = new PassThrough();
		const child = new EventEmitter() as EventEmitter & {
			stderr: PassThrough;
			stdout: PassThrough;
		};
		child.stdout = stdout;
		child.stderr = stderr;

		setTimeout(() => {
			stdout.end(JSON.stringify(TEST_APP));
			stderr.end();
			child.emit("close", 0);
		}, 0);

		return child as never;
	};

	const result = await executeEntryFileWithBun(
		"/tmp/example-app.ts",
		"bags play build",
		{
			env: {
				CUSTOM_FLAG: "1",
				NODE_ENV: "development",
				PATH: "/usr/bin",
			},
			makeTempDirectory: async () => "/tmp/bags-play-bun-test",
			removeDirectory: async () => undefined,
			requireBunOnPath: async () => "/usr/local/bin/bun",
			spawnProcess,
			writeFile: async () => undefined,
		},
	);

	expect(result).toBe(JSON.stringify(TEST_APP));
	expect(seenEnv).toMatchObject({
		CUSTOM_FLAG: "1",
		NODE_ENV: "production",
		PATH: "/usr/bin",
	});
});
