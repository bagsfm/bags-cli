import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { getSdkContext } from "../lib/sdk.js";

export function registerRobinhoodCommands(program: Command): void {
  const robinhood = program.command("robinhood").description("Robinhood Chain commands");

  robinhood
    .command("top-volume")
    .description("Get the top 100 Robinhood Chain tokens by lifetime volume")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).robinhood.getTopVolume();
        await printData(command, result);
      }),
    );
}
