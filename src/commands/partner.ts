import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend, signAndSendAll } from "../lib/tx.js";

type PartnerOptions = {
  partner?: string;
  skipConfirm?: boolean;
};

export function registerPartnerCommands(program: Command): void {
  const partner = program.command("partner").description("Partner configuration and claim");

  partner
    .command("create")
    .description("Create partner config for local wallet")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: PartnerOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();
        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Create partner config for ${keypair.publicKey.toBase58()}?`);
          if (!ok) return;
        }
        const tx = await (sdk as any).partner.createPartnerConfigTransaction(keypair.publicKey);
        const signature = await signAndSend(connection, commitment, tx, keypair);
        await printData(command, { signature });
      }),
    );

  partner
    .command("stats")
    .description("Get partner stats")
    .option("--partner <pubkey>", "Partner wallet pubkey")
    .action(
      wrapAction(async (command, options: PartnerOptions) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const partnerWallet = new PublicKey(await flagOrPrompt(options.partner, "Partner wallet (default local):"));
        const stats = await (sdk as any).partner.getPartnerStats(partnerWallet ?? keypair.publicKey);
        await printData(command, stats);
      }),
    );

  partner
    .command("claim")
    .description("Claim partner fees")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: PartnerOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Claim partner fees for ${keypair.publicKey.toBase58()}?`);
          if (!ok) return;
        }

        const txs = await (sdk as any).partner.getPartnerClaimTransactions(keypair.publicKey);
        const signatures = await signAndSendAll(connection, commitment, txs as any[], keypair);
        await printData(command, { signatures });
      }),
    );
}
