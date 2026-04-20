import type { Command } from "commander";
import { addExamplesAfter } from "../../utils/help.js";
import { registerCreateSubcommand } from "./create.js";
import { registerDeleteSubcommand } from "./delete.js";
import { registerListSubcommand } from "./list.js";
import { registerUpdateSubcommand } from "./update.js";

export const registerSecretsCommand = (parent: Command): void => {
	const secrets = parent.command("secrets").description("Inspect Play secrets");
	registerCreateSubcommand(secrets);
	registerListSubcommand(secrets);
	registerUpdateSubcommand(secrets);
	registerDeleteSubcommand(secrets);

	addExamplesAfter(secrets, [
		{
			description: "Create a secret",
			command: "bags play secrets create MY_API_KEY",
		},
		{
			description: "List all secrets",
			command: "bags play secrets list",
		},
	]);
};
