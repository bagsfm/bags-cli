import { BAGS_FEE_SHARE_ADMIN_MAX_CLAIMERS_NON_LUT, waitForSlotsToPass } from "@bagsfm/bags-sdk";
import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend, signAndSendAll } from "../lib/tx.js";

type ConfigOptions = {
  mint?: string;
  feeClaimers?: string;
  partner?: string;
  newAdmin?: string;
  skipConfirm?: boolean;
};

function parseClaimers(raw?: string): Array<{ user: PublicKey; userBps: number }> {
  if (!raw) {
    throw new Error("--fee-claimers is required. Example: '[{\"user\":\"...\",\"userBps\":10000}]'");
  }
  const parsed = JSON.parse(raw) as Array<{ user: string; userBps: number }>;
  return parsed.map((x) => ({ user: new PublicKey(x.user), userBps: x.userBps }));
}

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Fee share configuration");

  config
    .command("create")
    .description("Create a fee share config for a token")
    .option("--mint <address>", "Base mint")
    .option("--fee-claimers <json>", "JSON array [{user,userBps}]")
    .option("--partner <pubkey>", "Partner wallet")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const feeClaimers = parseClaimers(options.feeClaimers);
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Create fee config for ${mint.toBase58()}?`);
          if (!ok) return;
        }

        const result = await (sdk as any).config.createBagsFeeShareConfig({
          payer: keypair.publicKey,
          baseMint: mint,
          feeClaimers,
          partner: options.partner ? new PublicKey(options.partner) : undefined,
        });

        const signatures = Array.isArray(result.transactions)
          ? await signAndSendAll(connection, commitment, result.transactions, keypair)
          : [];

        await printData(command, {
          meteoraConfigKey: result.meteoraConfigKey?.toString?.() ?? result.meteoraConfigKey,
          signatures,
        });
      }),
    );

  config
    .command("update")
    .description("Update fee share config as admin")
    .option("--mint <address>", "Base mint")
    .option("--fee-claimers <json>", "JSON array [{user,userBps}]")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const feeClaimers = parseClaimers(options.feeClaimers);
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Update admin config for ${mint.toBase58()}?`);
          if (!ok) return;
        }

        let additionalLookupTables: PublicKey[] | undefined;
        if (feeClaimers.length > BAGS_FEE_SHARE_ADMIN_MAX_CLAIMERS_NON_LUT) {
          const lutResult = await (sdk as any).feeShareAdmin.getUpdateConfigLookupTableTransactions({
            payer: keypair.publicKey,
            feeClaimers,
          });
          if (lutResult) {
            await signAndSend(connection, commitment, lutResult.creationTransaction, keypair);
            await waitForSlotsToPass(connection, commitment, 1);
            for (const tx of lutResult.extendTransactions) {
              await signAndSend(connection, commitment, tx, keypair);
            }
            additionalLookupTables = lutResult.lutAddresses;
          }
        }

        const txsWithBlockhash = await (sdk as any).feeShareAdmin.getUpdateConfigTransactions({
          payer: keypair.publicKey,
          baseMint: mint,
          feeClaimers,
          additionalLookupTables,
        });

        const signatures = await signAndSendAll(
          connection,
          commitment,
          (txsWithBlockhash as any[]).map((tx) => tx.transaction),
          keypair,
        );
        await printData(command, { signatures });
      }),
    );

  config
    .command("transfer-admin")
    .description("Transfer fee share admin authority")
    .option("--mint <address>", "Base mint")
    .option("--new-admin <pubkey>", "New admin wallet")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const newAdmin = new PublicKey(await flagOrPrompt(options.newAdmin, "New admin:"));
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Transfer admin for ${mint.toBase58()} to ${newAdmin.toBase58()}?`);
          if (!ok) return;
        }

        const { transaction } = await (sdk as any).feeShareAdmin.getTransferAdminTransaction({
          payer: keypair.publicKey,
          currentAdmin: keypair.publicKey,
          baseMint: mint,
          newAdmin,
        });
        const signature = await signAndSend(connection, commitment, transaction, keypair);
        await printData(command, { signature });
      }),
    );

  config
    .command("admin-list")
    .description("List mints where wallet is fee share admin")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();
        const list = await (sdk as any).feeShareAdmin.getAdminTokenMints(keypair.publicKey);
        await printData(command, list);
      }),
    );
}
