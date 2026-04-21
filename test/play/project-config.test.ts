import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
	readProjectConfig,
	readProjectOverrides,
} from "../../src/play/config/project.ts";

const tempDirectories: string[] = [];

const createTempProject = async (contents: string): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), "bags-cli-play-project-"));
	tempDirectories.push(directory);
	await writeFile(join(directory, "bags.toml"), contents, "utf8");
	return directory;
};

afterEach(async () => {
	await Promise.all(
		tempDirectories
			.splice(0)
			.map((directory) => rm(directory, { force: true, recursive: true })),
	);
});

test("readProjectConfig reads runtime fields from bags.toml", async () => {
	const directory = await createTempProject(
		['entry = "src/app.ts"', 'runtime = "bun"', 'package_manager = "bun"'].join(
			"\n",
		),
	);

	await expect(readProjectConfig(directory)).resolves.toEqual({
		entry: "src/app.ts",
		packageManager: "bun",
		runtime: "bun",
	});
});

test("readProjectOverrides reads API URL overrides without requiring entry", async () => {
	const directory = await createTempProject(
		[
			'play_api = "https://play.project.example"',
			'bags_api = "https://bags.project.example"',
		].join("\n"),
	);

	await expect(readProjectOverrides(directory)).resolves.toEqual({
		bagsApiUrl: "https://bags.project.example",
		playApiUrl: "https://play.project.example",
	});
});
