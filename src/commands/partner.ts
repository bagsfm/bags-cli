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
        const { transaction } = await (sdk as any).partner.getPartnerConfigCreationTransaction(keypair.publicKey);
        const signature = await signAndSend(connection, commitment, transaction, keypair);
        await printData(command, { signature });
      }),
    );

  partner
    .command("config")
    .description("Get the on-chain partner config account")
    .option("--partner <pubkey>", "Partner wallet pubkey (default local)")
    .action(
      wrapAction(async (command, options: PartnerOptions) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const partnerWallet = options.partner ? new PublicKey(options.partner) : keypair.publicKey;
        const config = await (sdk as any).partner.getPartnerConfig(partnerWallet);
        await printData(command, {
          partner: config.partner.toBase58(),
          bump: config.bump,
          bps: config.bps,
          totalClaimedFees: config.totalClaimedFees.toString(),
          totalAccumulatedFees: config.totalAccumulatedFees.toString(),
          totalLifetimeAccumulatedFees: config.totalLifetimeAccumulatedFees.toString(),
        });
      }),
    );

  partner
    .command("stats")
    .description("Get partner claim stats")
    .option("--partner <pubkey>", "Partner wallet pubkey (default local)")
    .action(
      wrapAction(async (command, options: PartnerOptions) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const partnerWallet = options.partner ? new PublicKey(options.partner) : keypair.publicKey;
        const stats = await (sdk as any).partner.getPartnerConfigClaimStats(partnerWallet);
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

        const txsWithBlockhash = await (sdk as any).partner.getPartnerConfigClaimTransactions(keypair.publicKey);
        const signatures = await signAndSendAll(
          connection,
          commitment,
          (txsWithBlockhash as any[]).map((tx) => tx.transaction),
          keypair,
        );
        await printData(command, { signatures });
      }),
    );
}
