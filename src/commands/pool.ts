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

type ConfigKeysOptions = {
  vaults?: string;
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

  pool
    .command("config-keys")
    .description("Get the pool config key for one or more fee claimer vaults")
    .option("--vaults <json>", "JSON array of fee claimer vault addresses")
    .action(
      wrapAction(async (command, options: ConfigKeysOptions) => {
        const vaultsInput = await flagOrPrompt(options.vaults, "Fee claimer vaults (JSON array):");
        const parsed = JSON.parse(vaultsInput);
        if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
          throw new Error("--vaults must be a JSON array of vault addresses.");
        }
        const vaults = parsed.map((vault: string) => new PublicKey(vault));
        const { sdk } = await getSdkContext();
        const configKeys = await (sdk as any).state.getPoolConfigKeysByFeeClaimerVaults(vaults);
        await printData(command, (configKeys as any[]).map((key) => key.toBase58()));
      }),
    );
}
