import { expect, test } from "bun:test";
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
