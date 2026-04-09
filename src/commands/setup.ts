import chalk from "chalk";
import { Command } from "commander";
import { runAgentAuthFlow } from "../lib/auth.js";
import { wrapAction } from "../lib/command.js";
import { loadCliConfig, saveCliConfig } from "../lib/config.js";
import { BAGS_KEYPAIR_PATH } from "../lib/paths.js";
import { flagOrPrompt, promptSecret } from "../lib/prompt.js";
import {
  detectKeyFormat,
  importKeypairFromBase58,
  importKeypairFromIntArray,
} from "../lib/wallet.js";
import { withSpinner } from "../utils/spinner.js";

type SetupOptions = {
  rpcUrl?: string;
  privateKey?: string;
  keyName?: string;
};

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("First-run wizard: configure RPC, import wallet, and authenticate")
    .option("--rpc-url <url>", "Solana RPC URL")
    .option("--private-key <key>", "Private key (base58 or int array)")
    .option("--key-name <name>", "Label for API key", "Bags CLI Key")
    .action(
      wrapAction(async (command, options: SetupOptions) => {
        console.log(chalk.bold("\nBags CLI Setup\n"));

        const rpcUrl = await flagOrPrompt(
          options.rpcUrl,
          "Solana RPC URL (default: https://api.mainnet-beta.solana.com):",
        );
        const resolvedRpc = rpcUrl.trim() === "" ? "https://api.mainnet-beta.solana.com" : rpcUrl.trim();

        const config = await loadCliConfig();
        await saveCliConfig({ ...config, rpcUrl: resolvedRpc });
        console.log(chalk.green(`  RPC URL saved: ${resolvedRpc}`));

        let privateKeyRaw: string;
        if (options.privateKey) {
          privateKeyRaw = options.privateKey;
        } else {
          privateKeyRaw = await promptSecret("Private key (base58 or int array):");
        }

        const format = detectKeyFormat(privateKeyRaw);
        const keypair = await withSpinner("Importing wallet", async () => {
          if (format === "intArray") {
            return await importKeypairFromIntArray(privateKeyRaw);
          }
          return await importKeypairFromBase58(privateKeyRaw);
        });
        console.log(chalk.green(`  Wallet imported: ${keypair.publicKey.toBase58()}`));

        const credentials = await withSpinner("Authenticating with Bags", async () => {
          return await runAgentAuthFlow({
            keyName: options.keyName ?? "Bags CLI Key",
            keypairPath: BAGS_KEYPAIR_PATH,
            mfaCodeProvider: async () => await promptSecret("Enter MFA code:"),
          });
        });

        const masked = `${credentials.apiKey.slice(0, 6)}...${credentials.apiKey.slice(-4)}`;
        console.log(
          chalk.bold.green("\nSetup complete!\n") +
            `  Wallet:  ${credentials.walletAddress}\n` +
            `  API Key: ${masked}\n` +
            `  RPC:     ${resolvedRpc}\n`,
        );
      }),
    );
}
