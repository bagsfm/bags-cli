/**
 * `bags play` command group registration.
 *
 * Per locked decision D5, every Play subcommand is strictly nested under
 * `bags play`. The parent command has no `.action(...)` so `bags play`
 * with no subcommand prints the Play-scoped help (Commander default
 * behaviour, per D13).
 *
 * The `preActionHook` runs the legacy `play-cli` credentials migration
 * once before any Play subcommand executes. This makes existing play-cli
 * users transparently transition to the unified `~/.config/bags/`
 * credential file (PLAY_INTEGRATION.md section 9.4).
 *
 * @packageDocumentation
 */

import type { Command } from "commander";
import { registerArtCommand } from "./commands/art.js";
import { registerCompletionCommand } from "./commands/completion/index.js";
import { registerDeploymentsCommand } from "./commands/deployments/index.js";
import { registerPluginsCommand } from "./commands/plugins/index.js";
import { registerRunsCommand } from "./commands/runs/index.js";
import { registerSecretsCommand } from "./commands/secrets/index.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { migrateLegacyPlayCredentials } from "./config/credentials-migrate.js";
import { addExamplesAfter } from "./utils/help.js";

/**
 * Registers the `bags play` command group on the root program. Call this
 * from `src/index.ts` alongside the other `register*Commands` factories.
 */
export const registerPlayCommands = (program: Command): void => {
	const play = program
		.command("play")
		.description(
			"Bags Play — composable App automation (apps, runs, deployments)",
		)
		.hook("preAction", async () => {
			await migrateLegacyPlayCredentials();
		});

	registerArtCommand(play);
	registerWhoamiCommand(play);
	registerCompletionCommand(play);
	registerRunsCommand(play);
	registerDeploymentsCommand(play);
	registerPluginsCommand(play);
	registerSecretsCommand(play);

	addExamplesAfter(play, [
		{
			description: "Show authenticated Play user",
			command: "bags play whoami",
		},
		{
			description: "Display the Bags logo + system info",
			command: "bags play art",
		},
		{
			description: "Generate zsh completion script",
			command: "bags play completion zsh",
		},
		{
			description: "List recent runs",
			command: "bags play runs list",
		},
		{
			description: "Inspect a deployment",
			command: "bags play deployments get dep_abc123",
		},
	]);
};
