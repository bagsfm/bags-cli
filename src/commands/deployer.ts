import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSendAll } from "../lib/tx.js";

type DeployerClaimableOptions = {
  wallet?: string;
};

type DeployerClaimOptions = {
  tokenMints?: string;
  maxTransactions?: string;
  skipConfirm?: boolean;
};

export function registerDeployerCommands(program: Command): void {
  const deployer = program.command("deployer").description("Deployer fee-share revenue and claiming");

  deployer
    .command("claimable")
    .description("Get a deployer's claimable revenue")
    .option("--wallet <pubkey>", "Deployer wallet pubkey (default local)")
    .action(
      wrapAction(async (command, options: DeployerClaimableOptions) => {
        const { sdk } = await getSdkContext();
        const wallet = options.wallet ? new PublicKey(options.wallet) : (await getLocalSigner()).keypair.publicKey;
        const result = await (sdk as any).deployer.getClaimablePositions(wallet);
        await printData(command, result);
      }),
    );

  deployer
    .command("claim")
    .description("Claim deployer fee-share revenue for the local wallet")
    .option("--token-mints <addresses>", "Comma-separated base mints to filter pending pool claims (1-20)")
    .option("--max-transactions <n>", "Maximum number of transactions to request (1-20, default 10)")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: DeployerClaimOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Claim deployer revenue for ${keypair.publicKey.toBase58()}?`);
          if (!ok) return;
        }

        const tokenMints = options.tokenMints
          ?.split(",")
          .map((mint) => mint.trim())
          .filter(Boolean)
          .map((mint) => new PublicKey(mint));
        const maxTransactions = options.maxTransactions ? Number(options.maxTransactions) : undefined;

        const plan = await (sdk as any).deployer.getClaimTransactions(keypair.publicKey, {
          tokenMints,
          maxTransactions,
        });

        const signatures = await signAndSendAll(
          connection,
          commitment,
          (plan.transactions as any[]).map((tx) => tx.transaction),
          keypair,
        );

        await printData(command, {
          signatures,
          remainingTokenMints: plan.remainingTokenMints,
          deferredClaims: plan.deferredClaims,
        });
      }),
    );
}
