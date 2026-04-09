import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend } from "../lib/tx.js";

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

        const signatures: string[] = [];
        if (Array.isArray(result.transactions)) {
          for (const tx of result.transactions) {
            signatures.push(await signAndSend(connection, commitment, tx, keypair));
          }
        }

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

        const result = await (sdk as any).feeShareAdmin.createUpdateConfigTransactions({
          payer: keypair.publicKey,
          baseMint: mint,
          feeClaimers,
        });

        const signatures: string[] = [];
        if (Array.isArray(result.transactions)) {
          for (const tx of result.transactions) {
            signatures.push(await signAndSend(connection, commitment, tx, keypair));
          }
        }
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

        const tx = await (sdk as any).feeShareAdmin.createTransferAdminTransaction({
          payer: keypair.publicKey,
          baseMint: mint,
          newAdmin,
        });
        const signature = await signAndSend(connection, commitment, tx, keypair);
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
