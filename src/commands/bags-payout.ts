import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type PaymentOptions = { id?: string };

export function registerBagsPayoutCommands(program: Command): void {
  const bagsPayout = program.command("bags-payout").description("Bags payout reads");

  bagsPayout
    .command("payment")
    .description("Get one payout payment by its intent hash")
    .option("--id <hash>", "Payment intent hash (0x + 64 hex characters)")
    .action(
      wrapAction(async (command, options: PaymentOptions) => {
        const id = await flagOrPrompt(options.id, "Payment id (intent hash):");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getPayment(id);
        await printData(command, result);
      }),
    );
}
