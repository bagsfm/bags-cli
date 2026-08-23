import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type ClaimablePositionsOptions = { owner?: string };
type CreateClaimTransactionsOptions = { tokenAddress?: string; owner?: string };

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

  robinhood
    .command("claimable")
    .description("Get claimable Robinhood Chain fee positions for an EVM owner")
    .option("--owner <address>", "EVM wallet address")
    .action(
      wrapAction(async (command, options: ClaimablePositionsOptions) => {
        const owner = await flagOrPrompt(options.owner, "EVM owner address:");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).robinhood.getClaimablePositions(owner);
        await printData(command, result);
      }),
    );

  robinhood
    .command("create-claim-transactions")
    .description("Build unsigned Robinhood Chain claim transactions for a token (EVM — not signed or submitted by this CLI)")
    .option("--token-address <address>", "Robinhood Chain token address")
    .option("--owner <address>", "EVM owner address")
    .action(
      wrapAction(async (command, options: CreateClaimTransactionsOptions) => {
        const tokenAddress = await flagOrPrompt(options.tokenAddress, "Token address:");
        const owner = await flagOrPrompt(options.owner, "EVM owner address:");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).robinhood.createClaimTransactions({ tokenAddress, owner });
        await printData(command, result);
      }),
    );
}
