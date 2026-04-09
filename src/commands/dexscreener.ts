import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type MintOptions = {
  mint?: string;
  payload?: string;
};

type PaymentOptions = {
  orderId?: string;
  transaction?: string;
};

export function registerDexscreenerCommands(program: Command): void {
  const dexscreener = program.command("dexscreener").description("Dexscreener order flows");

  dexscreener
    .command("check")
    .description("Check Dexscreener order availability")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dexscreener.checkOrderAvailability(mint);
        await printData(command, result);
      }),
    );

  dexscreener
    .command("order")
    .description("Create Dexscreener order")
    .option("--mint <address>", "Token mint")
    .option("--payload <json>", "Raw JSON payload override")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = await flagOrPrompt(options.mint, "Token mint:");
        const payload =
          options.payload !== undefined
            ? (JSON.parse(options.payload) as Record<string, unknown>)
            : {
                tokenMint: mint,
              };
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dexscreener.createOrder(payload);
        await printData(command, result);
      }),
    );

  dexscreener
    .command("pay")
    .description("Submit Dexscreener payment")
    .option("--order-id <id>", "Order ID")
    .option("--transaction <tx>", "Signed serialized transaction")
    .action(
      wrapAction(async (command, options: PaymentOptions) => {
        const orderId = await flagOrPrompt(options.orderId, "Order ID:");
        const transaction = await flagOrPrompt(options.transaction, "Signed transaction:");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).dexscreener.submitPayment({ orderId, transaction });
        await printData(command, result);
      }),
    );
}
