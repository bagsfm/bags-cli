import { Command } from "commander";
import { registerSetupCommand } from "./commands/setup.js";
import { registerAuthCommands } from "./commands/auth.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDexscreenerCommands } from "./commands/dexscreener.js";
import { registerFeesCommands } from "./commands/fees.js";
import { registerIncorporationCommands } from "./commands/incorporation.js";
import { registerLaunchCommands } from "./commands/launch.js";
import { registerPartnerCommands } from "./commands/partner.js";
import { registerPoolCommands } from "./commands/pool.js";
import { registerSettingsCommands } from "./commands/settings.js";
import { registerTradeCommands } from "./commands/trade.js";
import { registerWalletCommands } from "./commands/wallet.js";
import { handleCliError } from "./utils/errors.js";

const program = new Command();

program
  .name("bags")
  .description("Bags CLI - auth, trading, launches, fees, and config")
  .version("0.1.2")
  .option("--json", "Output machine-readable JSON where supported");

registerSetupCommand(program);
registerAuthCommands(program);
registerWalletCommands(program);
registerFeesCommands(program);
registerTradeCommands(program);
registerLaunchCommands(program);
registerConfigCommands(program);
registerPartnerCommands(program);
registerPoolCommands(program);
registerDexscreenerCommands(program);
registerIncorporationCommands(program);
registerSettingsCommands(program);

async function main() {
  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    handleCliError(error);
  }
}

void main();
