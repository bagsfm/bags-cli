import { expect, test } from "bun:test";
import { Command } from "commander";
import { wrapPlayAction } from "../../src/play/utils/command.ts";

test("wrapPlayAction merges --input-json into command options", async () => {
	let seenOptions: { limit?: string } | undefined;

	const program = new Command();
	program.option("--input-json <json>");

	const play = program.command("play");
	const runs = play.command("runs");

	runs
		.command("list")
		.option("--limit <n>")
		.action(
			wrapPlayAction(async (_command, options: { limit?: string }) => {
				seenOptions = options;
			}),
		);

	await program.parseAsync([
		"node",
		"bags",
		"play",
		"runs",
		"list",
		"--input-json",
		'{"limit":"2"}',
	]);

	expect(seenOptions).toEqual({ limit: "2" });
});

test("wrapPlayAction keeps explicit CLI flags over --input-json values", async () => {
	let seenOptions: { limit?: string } | undefined;

	const program = new Command();
	program.option("--input-json <json>");

	const play = program.command("play");
	const runs = play.command("runs");

	runs
		.command("list")
		.option("--limit <n>")
		.action(
			wrapPlayAction(async (_command, options: { limit?: string }) => {
				seenOptions = options;
			}),
		);

	await program.parseAsync([
		"node",
		"bags",
		"play",
		"runs",
		"list",
		"--input-json",
		'{"limit":"2"}',
		"--limit",
		"9",
	]);

	expect(seenOptions).toEqual({ limit: "9" });
});
