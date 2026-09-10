import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, flagOrPromptNumber, optionalFlagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend } from "../lib/tx.js";

type TradeOptions = {
  inputMint?: string;
  outputMint?: string;
  amount?: number;
  slippageMode?: "auto" | "manual";
  slippageBps?: number;
  skipConfirm?: boolean;
};

type TradeV2Options = {
  inputMint?: string;
  outputMint?: string;
  taker?: string;
  amount?: string;
  slippageBps?: string;
  transactionSpeed?: "normal" | "fast" | "turbo";
  provider?: "auto" | "jupiter" | "titan";
  skipConfirm?: boolean;
};

async function resolveQuoteOptions(options: TradeOptions) {
  const inputMint = new PublicKey(await flagOrPrompt(options.inputMint, "Input mint:"));
  const outputMint = new PublicKey(await flagOrPrompt(options.outputMint, "Output mint:"));
  const amount = await flagOrPromptNumber(options.amount, "Amount (base units):");
  const slippageMode = (await flagOrPrompt(options.slippageMode, "Slippage mode (auto/manual):")) as
    | "auto"
    | "manual";
  const slippageBps =
    slippageMode === "manual" ? await flagOrPromptNumber(options.slippageBps, "Slippage BPS (e.g. 100):") : undefined;
  return { inputMint, outputMint, amount, slippageMode, slippageBps };
}

async function resolveQuoteV2Options(options: TradeV2Options, taker: PublicKey) {
  const inputMint = new PublicKey(await flagOrPrompt(options.inputMint, "Input mint:"));
  const outputMint = new PublicKey(await flagOrPrompt(options.outputMint, "Output mint:"));
  const amount = await flagOrPrompt(options.amount, "Amount (raw base units):");
  const slippageBpsRaw = await optionalFlagOrPrompt(options.slippageBps, "Slippage BPS (blank for auto):");
  const slippageBps = slippageBpsRaw === undefined ? ("auto" as const) : Number(slippageBpsRaw);
  const transactionSpeed = (options.transactionSpeed ?? "turbo") as "normal" | "fast" | "turbo";
  const provider = (options.provider ?? "auto") as "auto" | "jupiter" | "titan";
  return { inputMint, outputMint, taker, amount, slippageBps, transactionSpeed, provider };
}

export function registerTradeCommands(program: Command): void {
  const trade = program.command("trade").description("Quote and execute swaps");

  trade
    .command("quote")
    .description("Get a swap quote")
    .option("--input-mint <address>", "Input token mint")
    .option("--output-mint <address>", "Output token mint")
    .option("--amount <amount>", "Amount in base units", Number)
    .option("--slippage-mode <mode>", "auto or manual", "auto")
    .option("--slippage-bps <bps>", "Required for manual mode", Number)
    .action(
      wrapAction(async (command, options: TradeOptions) => {
        const { sdk } = await getSdkContext();
        const quoteArgs = await resolveQuoteOptions(options);
        const quote = await (sdk as any).trade.getQuote(quoteArgs);
        await printData(command, quote);
      }),
    );

  trade
    .command("swap")
    .description("Execute a swap (quote + transaction send)")
    .option("--input-mint <address>", "Input token mint")
    .option("--output-mint <address>", "Output token mint")
    .option("--amount <amount>", "Amount in base units", Number)
    .option("--slippage-mode <mode>", "auto or manual", "auto")
    .option("--slippage-bps <bps>", "Required for manual mode", Number)
    .option("--skip-confirm", "Skip transaction confirmation")
    .action(
      wrapAction(async (command, options: TradeOptions) => {
        const quoteArgs = await resolveQuoteOptions(options);
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        const quote = await (sdk as any).trade.getQuote(quoteArgs);
        if (!options.skipConfirm) {
          const ok = await promptConfirm(
            `Swap ${quoteArgs.amount} from ${quoteArgs.inputMint.toBase58()} to ${quoteArgs.outputMint.toBase58()}?`,
          );
          if (!ok) {
            return;
          }
        }

        const swap = await (sdk as any).trade.createSwapTransaction({
          quoteResponse: quote,
          userPublicKey: keypair.publicKey,
        });
        const signature = await signAndSend(connection, commitment, swap.transaction, keypair);
        await printData(command, { signature, quote, computeUnitLimit: swap.computeUnitLimit });
      }),
    );

  trade
    .command("v2-quote")
    .description("Get a server-built swap quote (Jupiter/Titan)")
    .option("--input-mint <address>", "Input token mint")
    .option("--output-mint <address>", "Output token mint")
    .option("--taker <address>", "Wallet that will sign the swap (defaults to the local wallet)")
    .option("--amount <amount>", "Amount in raw base units")
    .option("--slippage-bps <bps>", "Slippage in basis points, or omit for 'auto'")
    .option("--transaction-speed <speed>", "normal, fast, or turbo", "turbo")
    .option("--provider <provider>", "auto, jupiter, or titan", "auto")
    .action(
      wrapAction(async (command, options: TradeV2Options) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const taker = options.taker ? new PublicKey(options.taker) : keypair.publicKey;
        const quoteArgs = await resolveQuoteV2Options(options, taker);
        const quote = await (sdk as any).trade.getTradeV2Quote(quoteArgs);
        await printData(command, quote);
      }),
    );

  trade
    .command("v2-swap")
    .description("Execute a server-built swap (quote + transaction send)")
    .option("--input-mint <address>", "Input token mint")
    .option("--output-mint <address>", "Output token mint")
    .option("--amount <amount>", "Amount in raw base units")
    .option("--slippage-bps <bps>", "Slippage in basis points, or omit for 'auto'")
    .option("--transaction-speed <speed>", "normal, fast, or turbo", "turbo")
    .option("--provider <provider>", "auto, jupiter, or titan", "auto")
    .option("--skip-confirm", "Skip transaction confirmation")
    .action(
      wrapAction(async (command, options: TradeV2Options) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();
        const quoteArgs = await resolveQuoteV2Options(options, keypair.publicKey);

        const quote = await (sdk as any).trade.getTradeV2Quote(quoteArgs);
        if (!options.skipConfirm) {
          const ok = await promptConfirm(
            `Swap ${quoteArgs.amount} from ${quoteArgs.inputMint.toBase58()} to ${quoteArgs.outputMint.toBase58()}?`,
          );
          if (!ok) {
            return;
          }
        }

        const swap = await (sdk as any).trade.createTradeV2Swap({
          requestId: quote.requestId,
          userPublicKey: keypair.publicKey,
        });
        const signature = await signAndSend(connection, commitment, swap.transaction, keypair);
        await printData(command, {
          signature,
          quote,
          computeUnitLimit: swap.computeUnitLimit,
          feeLamports: swap.feeLamports,
          provider: swap.provider,
        });
      }),
    );
}
