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
  payoutMethod?: string;
  payoutUsername?: string;
  skipConfirm?: boolean;
};

function parseClaimers(raw?: string): Array<{ user: PublicKey; userBps: number }> {
  if (!raw) {
    throw new Error("--fee-claimers is required. Example: '[{\"user\":\"...\",\"userBps\":10000}]'");
  }
  const parsed = JSON.parse(raw) as Array<{ user: string; userBps: number }>;
  return parsed.map((x) => ({ user: new PublicKey(x.user), userBps: x.userBps }));
}

const PAYOUT_METHODS = ["venmo", "cashapp", "xmoney"];

function parsePayoutCashout(options: ConfigOptions): { method: string; username: string } | undefined {
  if (options.payoutMethod === undefined && options.payoutUsername === undefined) return undefined;
  if (!options.payoutMethod || !options.payoutUsername) {
    throw new Error("--payout-method and --payout-username must be provided together.");
  }
  if (!PAYOUT_METHODS.includes(options.payoutMethod)) {
    throw new Error(`--payout-method must be one of: ${PAYOUT_METHODS.join(", ")}.`);
  }
  const username = options.payoutUsername.trim();
  if (username.length < 1 || username.length > 64) {
    throw new Error("--payout-username must be between 1 and 64 characters.");
  }
  return { method: options.payoutMethod, username };
}

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Fee share configuration");

  config
    .command("create")
    .description("Create a fee share config for a token")
    .option("--mint <address>", "Base mint")
    .option("--fee-claimers <json>", "JSON array [{user,userBps}]")
    .option("--partner <pubkey>", "Partner wallet")
    .option("--payout-method <method>", "Payout cashout method: venmo, cashapp, xmoney (required when the payout wallet is the sole claimer)")
    .option("--payout-username <username>", "Payout cashout username (1-64 characters)")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const feeClaimers = parseClaimers(options.feeClaimers);
        const payoutCashout = parsePayoutCashout(options);
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
          payoutCashout,
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
    .option("--payout-method <method>", "Payout cashout method: venmo, cashapp, xmoney (required when the payout wallet is the sole claimer)")
    .option("--payout-username <username>", "Payout cashout username (1-64 characters)")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const feeClaimers = parseClaimers(options.feeClaimers);
        const payoutCashout = parsePayoutCashout(options);
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
          payoutCashout,
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
