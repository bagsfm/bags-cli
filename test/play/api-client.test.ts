import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { resolveApiClientConfig } from "../../src/play/api/client.ts";

const tempDirectories: string[] = [];

const createTempProject = async (contents: string): Promise<string> => {
	const directory = await mkdtemp(join(tmpdir(), "bags-cli-play-api-"));
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

test("resolveApiClientConfig uses bags.toml URL overrides before defaults", async () => {
	const directory = await createTempProject(
		[
			'play_api = "https://play.project.example"',
			'bags_api = "https://bags.project.example"',
		].join("\n"),
	);

	await expect(
		resolveApiClientConfig(
			{},
			{
				BAGS_API_KEY: "bags_prod_test_123",
			},
			directory,
		),
	).resolves.toMatchObject({
		apiKey: "bags_prod_test_123",
		bagsApiUrl: "https://bags.project.example",
		playApiUrl: "https://play.project.example",
	});
});

test("resolveApiClientConfig keeps environment URL overrides above bags.toml", async () => {
	const directory = await createTempProject(
		[
			'play_api = "https://play.project.example"',
			'bags_api = "https://bags.project.example"',
		].join("\n"),
	);

	await expect(
		resolveApiClientConfig(
			{},
			{
				BAGS_API_KEY: "bags_prod_test_123",
				BAGS_API_URL: "https://bags.env.example",
				BAGS_PLAY_API_URL: "https://play.env.example",
			},
			directory,
		),
	).resolves.toMatchObject({
		bagsApiUrl: "https://bags.env.example",
		playApiUrl: "https://play.env.example",
	});
});

test("resolveApiClientConfig keeps explicit overrides above env and bags.toml", async () => {
	const directory = await createTempProject(
		[
			'play_api = "https://play.project.example"',
			'bags_api = "https://bags.project.example"',
		].join("\n"),
	);

	await expect(
		resolveApiClientConfig(
			{
				bagsApiUrl: "https://bags.cli.example",
				playApiUrl: "https://play.cli.example",
			},
			{
				BAGS_API_KEY: "bags_prod_test_123",
				BAGS_API_URL: "https://bags.env.example",
				BAGS_PLAY_API_URL: "https://play.env.example",
			},
			directory,
		),
	).resolves.toMatchObject({
		bagsApiUrl: "https://bags.cli.example",
		playApiUrl: "https://play.cli.example",
	});
});
