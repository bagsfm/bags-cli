import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type ProfileOptions = { mint?: string };
type ProfileBulkOptions = { mints?: string };
type HistoryOptions = { mint?: string; limit?: number; cursor?: string };

export function registerDividendsCommands(program: Command): void {
  const dividends = program.command("dividends").description("Solana token launch dividend basket commands");

  dividends
    .command("profile")
    .description("Get the dividend profile for a token launch")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: ProfileOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dividends.getProfile(mint);
        await printData(command, result);
      }),
    );

  dividends
    .command("profile-bulk")
    .description("Get dividend profiles for up to 100 token launches")
    .option("--mints <addresses>", "Comma-separated token mints (1-100, unique)")
    .action(
      wrapAction(async (command, options: ProfileBulkOptions) => {
        const mintsInput = await flagOrPrompt(options.mints, "Token mints (comma-separated):");
        const mints = mintsInput
          .split(",")
          .map((mint) => mint.trim())
          .filter(Boolean)
          .map((mint) => new PublicKey(mint));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dividends.getProfilesBulk(mints);
        await printData(command, result);
      }),
    );

  dividends
    .command("status")
    .description("Get the live dividend distribution status for a token launch")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: ProfileOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dividends.getStatus(mint);
        await printData(command, result);
      }),
    );

  dividends
    .command("history")
    .description("Get completed dividend distribution cycles for a token launch")
    .option("--mint <address>", "Token mint")
    .option("--limit <n>", "Number of items", Number)
    .option("--cursor <id>", "Pagination cursor from a previous response's nextCursor")
    .action(
      wrapAction(async (command, options: HistoryOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dividends.getHistory({
          tokenMint: mint,
          limit: options.limit,
          cursor: options.cursor,
        });
        await printData(command, result);
      }),
    );
}
