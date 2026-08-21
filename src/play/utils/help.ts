/**
 * Lightweight help-text helpers for Play commands.
 *
 * Replaces play-cli's full custom `applyStyledHelp` (which rewrote
 * `helpInformation`) with a minimal `addHelpText` adapter that keeps
 * Commander's default styling per locked decision D7. Each Play command
 * calls `addExamplesAfter(command, [...])` to append a styled examples
 * block underneath Commander's auto-generated help.
 *
 * @packageDocumentation
 */

import type { Command } from "commander";
import { cmd } from "./colors.js";

/** A single example entry shown in `Examples:` blocks. */
export interface HelpExample {
	/** Optional short description shown above the command. */
	description?: string;
	/** Full command string (e.g. `"bags play whoami"`). */
	command: string;
}

/**
 * Renders an `Examples:` block as a string suitable for `addHelpText("after", ...)`.
 * Returns an empty string when no examples are provided.
 */
export const renderExamples = (examples: readonly HelpExample[]): string => {
	if (examples.length === 0) {
		return "";
	}

	const lines: string[] = ["", "Examples:"];
	for (const example of examples) {
		if (example.description) {
			lines.push(`  ${example.description}`);
		}
		lines.push(`  ${cmd(example.command)}`);
		lines.push("");
	}

	return lines.join("\n");
};

/**
 * Convenience: attach an `Examples:` block to a Commander command via
 * `addHelpText("after", ...)`.
 */
export const addExamplesAfter = (
	command: Command,
	examples: readonly HelpExample[],
): Command => {
	const text = renderExamples(examples);
	if (text.length > 0) {
		command.addHelpText("after", text);
	}
	return command;
};
