import { BAGS_FEE_SHARE_ADMIN_MAX_CLAIMERS_NON_LUT, waitForSlotsToPass } from "@bagsfm/bags-sdk";
import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, optionalFlagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend, signAndSendAll, signAndSendQuotePlan } from "../lib/tx.js";

type ConfigOptions = {
  mint?: string;
  feeClaimers?: string;
  partner?: string;
  newAdmin?: string;
  skipConfirm?: boolean;
};

type QuoteConfigOptions = {
  mint?: string;
  feeClaimers?: string;
  flow?: string;
  quoteMint?: string;
  partner?: string;
  skipConfirm?: boolean;
};

type QuoteUpdateConfigOptions = {
  mint?: string;
  feeClaimers?: string;
  skipConfirm?: boolean;
};

function parseClaimers(raw?: string): Array<{ user: PublicKey; userBps: number }> {
  if (!raw) {
    throw new Error("--fee-claimers is required. Example: '[{\"user\":\"...\",\"userBps\":10000}]'");
  }
  const parsed = JSON.parse(raw) as Array<{ user: string; userBps: number }>;
  return parsed.map((x) => ({ user: new PublicKey(x.user), userBps: x.userBps }));
}

function parseQuoteRecipients(raw?: string): { claimersArray: PublicKey[]; basisPointsArray: number[] } {
  const claimers = parseClaimers(raw);
  return {
    claimersArray: claimers.map((c) => c.user),
    basisPointsArray: claimers.map((c) => c.userBps),
  };
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
    .command("create-quote")
    .description("Create a native quote fee share config (any reviewed quote mint, not just SOL)")
    .option("--mint <address>", "Base mint")
    .option("--fee-claimers <json>", "JSON array [{user,userBps}]")
    .option("--flow <dbc|damm_v2_direct>", "Native quote launch flow")
    .option("--quote-mint <address>", "Quote mint to denominate the config in (defaults to wrapped SOL)")
    .option("--partner <pubkey>", "Partner wallet")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: QuoteConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const { claimersArray, basisPointsArray } = parseQuoteRecipients(options.feeClaimers);
        const flow = await flagOrPrompt(options.flow, "Flow (dbc/damm_v2_direct):");
        if (flow !== "dbc" && flow !== "damm_v2_direct") {
          throw new Error("--flow must be 'dbc' or 'damm_v2_direct'.");
        }
        const quoteMint = await optionalFlagOrPrompt(options.quoteMint, "Quote mint (optional, defaults to wrapped SOL):");
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Create native quote fee config for ${mint.toBase58()}?`);
          if (!ok) return;
        }

        const result = await (sdk as any).config.createQuoteFeeShareConfig({
          baseMint: mint,
          payer: keypair.publicKey,
          flow,
          claimersArray,
          basisPointsArray,
          quoteMint: quoteMint ? new PublicKey(quoteMint) : undefined,
          partner: options.partner ? new PublicKey(options.partner) : undefined,
        });

        if (!result.needsCreation || !result.plan) {
          await printData(command, { needsCreation: result.needsCreation, feeShareConfig: result.feeShareConfig.toBase58() });
          return;
        }

        const { signatures, readiness } = await signAndSendQuotePlan(connection, commitment, keypair, result.plan);
        await printData(command, { feeShareConfig: result.feeShareConfig.toBase58(), signatures, readiness });
      }),
    );

  config
    .command("update-quote")
    .description("Update the recipients of a native quote fee share config")
    .option("--mint <address>", "Base mint")
    .option("--fee-claimers <json>", "JSON array [{user,userBps}]")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: QuoteUpdateConfigOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Base mint:"));
        const { claimersArray, basisPointsArray } = parseQuoteRecipients(options.feeClaimers);
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Update native quote config for ${mint.toBase58()}?`);
          if (!ok) return;
        }

        const plan = await (sdk as any).feeShareAdmin.updateQuoteFeeShareConfig({
          baseMint: mint,
          payer: keypair.publicKey,
          claimersArray,
          basisPointsArray,
        });

        const { signatures, readiness } = await signAndSendQuotePlan(connection, commitment, keypair, plan);
        await printData(command, { signatures, readiness });
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
