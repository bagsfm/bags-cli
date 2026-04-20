import type { Command } from "commander";
import { addExamplesAfter } from "../../utils/help.js";
import { registerCancelSubcommand } from "./cancel.js";
import { registerFeesSubcommand } from "./fees.js";
import { registerGetSubcommand } from "./get.js";
import { registerListSubcommand } from "./list.js";
import { registerLogsSubcommand } from "./logs.js";
import { registerTriggerSubcommand } from "./trigger.js";

export const registerRunsCommand = (parent: Command): void => {
	const runs = parent.command("runs").description("Inspect Play runs");

	registerListSubcommand(runs);
	registerGetSubcommand(runs);
	registerFeesSubcommand(runs);
	registerLogsSubcommand(runs);
	registerTriggerSubcommand(runs);
	registerCancelSubcommand(runs);

	addExamplesAfter(runs, [
		{
			description: "List failed runs",
			command: "bags play runs list --status failed",
		},
		{
			description: "Inspect a specific run",
			command: "bags play runs get run_abc123",
		},
		{
			description: "View run logs",
			command: "bags play runs logs run_abc123 --compact",
		},
		{
			description: "Trigger a run",
			command: "bags play runs trigger my-app --input tokenMint=abc",
		},
	]);
};
