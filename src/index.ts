// `--no-color` and `--json` must take effect *before* any chalk-using
// module is imported, since chalk reads `NO_COLOR` once at import time.
// Detect them from raw argv here, before the Commander/chalk imports below.
if (process.argv.includes("--no-color")) {
	process.env.NO_COLOR = "1";
}
if (process.argv.includes("--json")) {
	process.env.NO_COLOR = "1";
}

import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDexscreenerCommands } from "./commands/dexscreener.js";
import { registerFeesCommands } from "./commands/fees.js";
import { registerLaunchCommands } from "./commands/launch.js";
import { registerPartnerCommands } from "./commands/partner.js";
import { registerPoolCommands } from "./commands/pool.js";
import { registerRobinhoodCommands } from "./commands/robinhood.js";
import { registerSettingsCommands } from "./commands/settings.js";
import { registerSetupCommand } from "./commands/setup.js";
import { registerTradeCommands } from "./commands/trade.js";
import { registerWalletCommands } from "./commands/wallet.js";
import { registerPlayCommands } from "./play/index.js";
import { handleCliError } from "./utils/errors.js";
import { cliVersion } from "./version.js";

const program = new Command();

program
	.name("bags")
	.description("Bags CLI — auth, trading, launches, fees, Play, and config")
	.version(cliVersion)
	.option("--json", "Output machine-readable JSON where supported")
	.option("--input-json <json>", "Pass all options as a JSON object")
	.option("-q, --quiet", "Suppress non-error output")
	.option("--no-color", "Disable colored output")
	.option("--play-api <url>", "Override Play API base URL")
	.option("--bags-api <url>", "Override Bags API base URL");

registerSetupCommand(program);
registerAuthCommands(program);
registerWalletCommands(program);
registerFeesCommands(program);
registerTradeCommands(program);
registerLaunchCommands(program);
registerConfigCommands(program);
registerPartnerCommands(program);
registerPoolCommands(program);
registerRobinhoodCommands(program);
registerDexscreenerCommands(program);
registerSettingsCommands(program);
registerPlayCommands(program);

async function main() {
	// Hidden `__complete` protocol hook used by shell completion scripts.
	// Must dispatch BEFORE Commander parses (Commander would error on the
	// unknown command). The completer module is dynamic-imported so cold
	// startup for `bags --help` etc. stays fast.
	if (process.argv[2] === "__complete") {
		const { handleCompletion } = await import(
			"./play/commands/completion/completer.js"
		);
		handleCompletion(program, process.argv.slice(4));
		process.exit(0);
	}

	try {
		await program.parseAsync(process.argv);
	} catch (error) {
		handleCliError(error);
	}
}

void main();
