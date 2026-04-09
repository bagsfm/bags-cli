import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { CliConfig, loadCliConfig, OutputMode, saveCliConfig } from "../lib/config.js";
import { printData } from "../lib/output.js";

type SetOptions = {
  rpcUrl?: string;
  commitment?: "processed" | "confirmed" | "finalized";
  output?: OutputMode;
};

export function registerSettingsCommands(program: Command): void {
  const settings = program.command("settings").description("CLI settings");

  settings
    .command("show")
    .description("Show current settings")
    .action(
      wrapAction(async (command) => {
        const config = await loadCliConfig();
        await printData(command, config);
      }),
    );

  settings
    .command("set")
    .description("Set one or more settings")
    .option("--rpc-url <url>", "Default RPC URL")
    .option("--commitment <level>", "processed|confirmed|finalized")
    .option("--output <mode>", "pretty|table|json")
    .action(
      wrapAction(async (command, options: SetOptions) => {
        const current = await loadCliConfig();
        const next: CliConfig = {
          rpcUrl: options.rpcUrl ?? current.rpcUrl,
          commitment: options.commitment ?? current.commitment,
          output: options.output ?? current.output,
        };
        await saveCliConfig(next);
        await printData(command, next);
      }),
    );
}
