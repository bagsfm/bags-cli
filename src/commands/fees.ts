import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { getSdkContext } from "../lib/sdk.js";
import { wrapAction } from "../lib/command.js";
import { printData, printTable } from "../lib/output.js";
import { flagOrPrompt, flagOrPromptNumber, promptConfirm } from "../lib/prompt.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSendAll } from "../lib/tx.js";
import { lamportsToSol, shortAddress } from "../utils/format.js";

type MintOptions = {
  mint?: string;
  raw?: boolean;
  skipConfirm?: boolean;
  offset?: number;
  limit?: number;
  startTime?: string;
  endTime?: string;
};

async function resolveMint(value?: string): Promise<PublicKey> {
  const mint = await flagOrPrompt(value, "Token mint:");
  return new PublicKey(mint);
}

async function getClaimTransactionsForMint(sdk: unknown, wallet: PublicKey, mint: PublicKey): Promise<any[]> {
  const fee = (sdk as any).fee;
  if (typeof fee.getClaimTransactions === "function") {
    return await fee.getClaimTransactions(wallet, mint);
  }
  if (typeof fee.getClaimTransaction === "function") {
    const tx = await fee.getClaimTransaction(wallet, mint);
    return tx ? [tx] : [];
  }
  throw new Error("This SDK version does not expose claim transaction methods.");
}

export function registerFeesCommands(program: Command): void {
  const fees = program.command("fees").description("Fee claiming and fee analytics");

  fees
    .command("list")
    .description("List claimable fee positions for local wallet")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const positions = await (sdk as any).fee.getAllClaimablePositions(keypair.publicKey);
        const rows = (positions as any[]).map((p) => [
          String(p.baseMint ?? ""),
          Number(p.totalClaimableLamportsUserShare ?? 0),
          p.isCustomFeeVault ? "yes" : "no",
        ]);
        await printTable(command, ["Mint", "Claimable Lamports", "Custom Vault"], rows);
      }),
    );

  fees
    .command("claim")
    .description("Claim fees for a single token mint")
    .argument("[mint]", "Token mint address")
    .option("--mint <address>", "Token mint")
    .option("--skip-confirm", "Skip transaction confirmation")
    .action(
      wrapAction(async (command, mintArg: string | undefined, options: MintOptions) => {
        const mint = await resolveMint(mintArg ?? options.mint);
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Claim fees for ${mint.toBase58()}?`);
          if (!ok) {
            return;
          }
        }

        const transactions = await getClaimTransactionsForMint(sdk, keypair.publicKey, mint);
        const signatures = await signAndSendAll(connection, commitment, transactions, keypair);
        await printData(command, { mint: mint.toBase58(), signatures });
      }),
    );

  fees
    .command("claim-all")
    .description("Claim all claimable fees for the local wallet")
    .option("--skip-confirm", "Skip transaction confirmation")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();
        const feeService = (sdk as any).fee;
        const positions = (await feeService.getAllClaimablePositions(keypair.publicKey)) as any[];
        const mints = [...new Set(positions.map((p) => String(p.baseMint)))];

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Claim fees across ${mints.length} token(s)?`);
          if (!ok) {
            return;
          }
        }

        const sent: Array<{ mint: string; signatures: string[] }> = [];
        for (const mint of mints) {
          const txs = await getClaimTransactionsForMint(sdk, keypair.publicKey, new PublicKey(mint));
          const signatures = await signAndSendAll(connection, commitment, txs, keypair);
          sent.push({ mint, signatures });
        }

        await printData(command, { count: sent.length, claims: sent });
      }),
    );

  fees
    .command("lifetime")
    .description("Get token lifetime fees")
    .argument("[mint]", "Token mint address")
    .option("--mint <address>", "Token mint")
    .option("--raw", "Show raw lamports instead of SOL")
    .action(
      wrapAction(async (command, mintArg: string | undefined, options: MintOptions) => {
        const mint = await resolveMint(mintArg ?? options.mint);
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getTokenLifetimeFees(mint);
        if (typeof result === "number") {
          await printData(command, {
            mint: mint.toBase58(),
            lifetimeFees: options.raw ? `${result} lamports` : `${lamportsToSol(result)} SOL`,
          });
        } else {
          await printData(command, result);
        }
      }),
    );

  fees
    .command("events")
    .description("Get token claim events")
    .argument("[mint]", "Token mint address")
    .option("--mint <address>", "Token mint")
    .option("--offset <n>", "Offset", Number)
    .option("--limit <n>", "Limit", Number)
    .option("--start-time <iso>", "Start timestamp (ISO)")
    .option("--end-time <iso>", "End timestamp (ISO)")
    .action(
      wrapAction(async (command, mintArg: string | undefined, options: MintOptions) => {
        const mint = await resolveMint(mintArg ?? options.mint);
        const { sdk } = await getSdkContext();
        const payload: Record<string, unknown> = { mint: mint.toBase58() };
        if (options.offset !== undefined) payload.offset = options.offset;
        if (options.limit !== undefined) payload.limit = options.limit;
        if (options.startTime) payload.startTime = options.startTime;
        if (options.endTime) payload.endTime = options.endTime;
        const result = await (sdk as any).state.getTokenClaimEvents(payload);
        await printData(command, result);
      }),
    );

  fees
    .command("stats")
    .description("Get token claim stats")
    .argument("[mint]", "Token mint address")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, mintArg: string | undefined, options: MintOptions) => {
        const mint = await resolveMint(mintArg ?? options.mint);
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getTokenClaimStats(mint);
        await printData(command, result);
      }),
    );
}
