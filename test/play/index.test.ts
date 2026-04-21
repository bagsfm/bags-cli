import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { Command } from "commander";
import { registerPlayCommands } from "../../src/play/index.ts";

const getPlayCommand = (): Command => {
	const program = new Command();
	registerPlayCommands(program);
	const playCommand = program.commands.find(
		(command) => command.name() === "play",
	);

	if (!playCommand) {
		throw new Error("Expected `play` command to be registered.");
	}

	return playCommand;
};

test("registerPlayCommands includes the heavy commands", () => {
	const playCommand = getPlayCommand();

	expect(playCommand.commands.map((command) => command.name())).toEqual(
		expect.arrayContaining(["build", "publish", "patch", "verify"]),
	);
});

test("registerPlayCommands labels heavy admin commands with [admin]", () => {
	const playCommand = getPlayCommand();
	const patchCommand = playCommand.commands.find(
		(command) => command.name() === "patch",
	);
	const verifyCommand = playCommand.commands.find(
		(command) => command.name() === "verify",
	);

	expect(patchCommand?.description()).toContain("[admin]");
	expect(verifyCommand?.description()).toContain("[admin]");
});

test("registerPlayCommands wires info through registerInfoCommand", async () => {
	const source = await readFile(
		new URL("../../src/play/index.ts", import.meta.url),
		"utf8",
	);

	expect(source).toContain(
		'import { registerInfoCommand } from "./commands/info.js";',
	);
	expect(source).toContain("registerInfoCommand(play);");
	expect(source).not.toContain('await import("./commands/info.js")');
});
