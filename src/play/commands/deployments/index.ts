import type { Command } from "commander";
import { addExamplesAfter } from "../../utils/help.js";
import { registerGetSubcommand } from "./get.js";
import { registerListSubcommand } from "./list.js";
import { registerPauseSubcommand } from "./pause.js";
import { registerUnpauseSubcommand } from "./unpause.js";

export const registerDeploymentsCommand = (parent: Command): void => {
	const deployments = parent
		.command("deployments")
		.description("Inspect Play deployments");

	registerListSubcommand(deployments);
	registerGetSubcommand(deployments);
	registerPauseSubcommand(deployments);
	registerUnpauseSubcommand(deployments);

	addExamplesAfter(deployments, [
		{
			description: "List active deployments",
			command: "bags play deployments list --status active",
		},
		{
			description: "Inspect a deployment",
			command: "bags play deployments get dep_abc123",
		},
		{
			description: "Pause a deployment",
			command: 'bags play deployments pause dep_abc123 --reason "maintenance"',
		},
	]);
};
