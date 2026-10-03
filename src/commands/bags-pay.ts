import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type MintOptions = {
  mint?: string;
};

type BulkOptions = {
  mints?: string;
};

type HistoryOptions = MintOptions & {
  limit?: string;
  cursor?: string;
};

export function registerBagsPayCommands(program: Command): void {
  const bagsPay = program.command("bags-pay").description("BagsPay coin mappings, status, and history");

  bagsPay
    .command("token")
    .description("Get who a coin's BagsPay fees pay (null when unmapped)")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPay.getToken(mint);
        await printData(command, result);
      }),
    );

  bagsPay
    .command("token-bulk")
    .description("Get BagsPay mappings for up to 100 coins")
    .option("--mints <addresses>", "Comma-separated token mints")
    .action(
      wrapAction(async (command, options: BulkOptions) => {
        const raw = await flagOrPrompt(options.mints, "Token mints (comma-separated):");
        const mints = raw
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
          .map((value) => new PublicKey(value));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPay.getTokensBulk(mints);
        await printData(command, result);
      }),
    );

  bagsPay
    .command("status")
    .description("Get a coin's BagsPay phase and open distribution")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPay.getStatus(mint);
        await printData(command, result);
      }),
    );

  bagsPay
    .command("history")
    .description("Get a coin's BagsPay distribution history")
    .option("--mint <address>", "Token mint")
    .option("--limit <n>", "Page size (1-50, default 20)")
    .option("--cursor <cursor>", "nextCursor from the previous page")
    .action(
      wrapAction(async (command, options: HistoryOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPay.getHistory(mint, {
          ...(options.limit !== undefined ? { limit: Number(options.limit) } : {}),
          ...(options.cursor !== undefined ? { cursor: options.cursor } : {}),
        });
        await printData(command, result);
      }),
    );
}
