import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type PoolListOptions = {
  limit?: number;
  offset?: number;
};

type MintOptions = {
  mint?: string;
};

export function registerPoolCommands(program: Command): void {
  const pool = program.command("pool").description("Pool lookup commands");

  pool
    .command("list")
    .description("List Bags pools")
    .option("--limit <n>", "Limit", Number)
    .option("--offset <n>", "Offset", Number)
    .action(
      wrapAction(async (command, options: PoolListOptions) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getBagsPools({
          limit: options.limit ?? 50,
          offset: options.offset ?? 0,
        });
        await printData(command, result);
      }),
    );

  pool
    .command("get")
    .description("Get Bags pool by token mint")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getBagsPoolByTokenMint(mint);
        await printData(command, result);
      }),
    );
}
