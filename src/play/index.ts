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
import { registerInfoCommand } from "./commands/info.js";
import { registerInitCommand } from "./commands/init/index.js";
import { registerPluginsCommand } from "./commands/plugins/index.js";
import { registerRunsCommand } from "./commands/runs/index.js";
import { registerSecretsCommand } from "./commands/secrets/index.js";
import { registerWhoamiCommand } from "./commands/whoami.js";
import { migrateLegacyPlayCredentials } from "./config/credentials-migrate.js";
import { addExamplesAfter } from "./utils/help.js";

interface DeferredBuildCommandOptions {
	json?: boolean;
	output?: string;
	quiet?: boolean;
}

interface DeferredPublishCommandOptions {
	bagsApi?: string;
	dryRun?: boolean;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
}

interface DeferredPatchCommandOptions {
	bagsApi?: string;
	force?: boolean;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
	token?: string;
}

interface DeferredVerifyCommandOptions {
	bagsApi?: string;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
	token?: string;
}

/**
 * Registers the `bags play` command group on the root program. Call this
 * from `src/index.ts` alongside the other `register*Commands` factories.
 */
export const registerPlayCommands = (program: Command): void => {
	const play = program
		.command("play")
		.description("Bags Play (apps, runs, deployments)")
		.hook("preAction", async () => {
			await migrateLegacyPlayCredentials();
		});

	registerArtCommand(play);
	registerWhoamiCommand(play);
	registerInitCommand(play);
	registerCompletionCommand(play);
	registerRunsCommand(play);
	registerDeploymentsCommand(play);
	registerInfoCommand(play);
	registerPluginsCommand(play);
	registerSecretsCommand(play);

	const buildCommand = play
		.command("build")
		.description("Build App definition into JSON artifact")
		.option(
			"-o, --output <dir>",
			"output directory for the artifact",
			"release",
		)
		.action(async function (this: Command) {
			const { executeBuild } = await import("./commands/build.js");
			const globalOptions = this.optsWithGlobals<DeferredBuildCommandOptions>();
			const localOptions = this.opts<{ output?: string }>();
			await executeBuild({
				...globalOptions,
				output: localOptions.output,
			});
		});

	addExamplesAfter(buildCommand, [
		{ command: "bags play build" },
		{
			description: "Custom output directory",
			command: "bags play build -o dist",
		},
	]);

	const publishCommand = play
		.command("publish")
		.description("Build and publish to App Store")
		.option("--dry-run", "validate the publish without uploading")
		.action(async function (this: Command) {
			const { executePublish } = await import("./commands/publish.js");
			const globalOptions =
				this.optsWithGlobals<DeferredPublishCommandOptions>();
			const localOptions = this.opts<{ dryRun?: boolean }>();
			await executePublish({
				...globalOptions,
				dryRun: localOptions.dryRun,
			});
		});

	addExamplesAfter(publishCommand, [
		{ command: "bags play publish" },
		{
			description: "Validate without uploading",
			command: "bags play publish --dry-run",
		},
	]);

	const patchCommand = play
		.command("patch <appId> <version>")
		.description("Overwrite deployed version [admin]")
		.option("--force", "skip confirmation prompt")
		.option("--token <token>", "admin token (overrides BAGS_PLAY_ADMIN_TOKEN)")
		.action(async function (this: Command, appId: string, version: string) {
			const { executePatch } = await import("./commands/patch.js");
			const globalOptions = this.optsWithGlobals<DeferredPatchCommandOptions>();
			const localOptions = this.opts<{ force?: boolean; token?: string }>();
			await executePatch(appId, version, {
				...globalOptions,
				force: localOptions.force,
				token: localOptions.token,
			});
		});

	addExamplesAfter(patchCommand, [
		{ command: "bags play patch fee-compounder 1.2.0" },
		{
			description: "Skip confirmation",
			command: "bags play patch fee-compounder 1.2.0 --force",
		},
	]);

	const verifyCommand = play
		.command("verify <appId> [version]")
		.description("Mark App as verified [admin]")
		.option("--token <token>", "admin token (overrides BAGS_PLAY_ADMIN_TOKEN)")
		.action(async function (this: Command, appId: string, version?: string) {
			const { executeVerify } = await import("./commands/verify.js");
			const globalOptions =
				this.optsWithGlobals<DeferredVerifyCommandOptions>();
			const localOptions = this.opts<{ token?: string }>();
			await executeVerify(appId, version, {
				...globalOptions,
				token: localOptions.token,
			});
		});

	addExamplesAfter(verifyCommand, [
		{
			description: "Verify the latest published version",
			command: "bags play verify fee-compounder",
		},
		{
			description: "Verify a specific version",
			command: "bags play verify fee-compounder 1.2.0",
		},
	]);

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
			description: "Scaffold a new App",
			command: "bags play init --app --name fee-compounder",
		},
		{
			description: "Inspect the current Play project",
			command: "bags play info",
		},
		{
			description: "Build the current Play project",
			command: "bags play build",
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
