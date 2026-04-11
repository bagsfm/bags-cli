import chalk from "chalk";
import { Command } from "commander";
import { parseAuthMode, runAgentAuthFlow, runManualAuthFlow } from "../lib/auth.js";
import { wrapAction } from "../lib/command.js";
import { loadCliConfig, saveCliConfig } from "../lib/config.js";
import { log, printData } from "../lib/output.js";
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
  authMode?: string;
  apiKey?: string;
};

export function registerSetupCommand(program: Command): void {
  program
    .command("setup")
    .description("First-run wizard: configure RPC, import wallet, and authenticate")
    .option("--rpc-url <url>", "Solana RPC URL")
    .option("--private-key <key>", "Private key (base58 or int array)")
    .option("--key-name <name>", "Label for API key", "Bags CLI Key")
    .option("--auth-mode <mode>", "Authentication mode: wallet|manual", "wallet")
    .option("--api-key <key>", "API key (required when auth mode is manual)")
    .action(
      wrapAction(async (command, options: SetupOptions) => {
        await log(command, chalk.bold("\nBags CLI Setup\n"));

        const rpcUrl = await flagOrPrompt(
          options.rpcUrl,
          "Solana RPC URL (default: https://api.mainnet-beta.solana.com):",
        );
        const resolvedRpc = rpcUrl.trim() === "" ? "https://api.mainnet-beta.solana.com" : rpcUrl.trim();

        const config = await loadCliConfig();
        await saveCliConfig({ ...config, rpcUrl: resolvedRpc });
        await log(command, chalk.green(`  RPC URL saved: ${resolvedRpc}`));

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
        await log(command, chalk.green(`  Wallet imported: ${keypair.publicKey.toBase58()}`));

        const authMode = parseAuthMode(options.authMode);
        const credentials =
          authMode === "wallet"
            ? await withSpinner("Authenticating with Bags", async () => {
                return await runAgentAuthFlow({
                  keyName: options.keyName ?? "Bags CLI Key",
                  keypairPath: BAGS_KEYPAIR_PATH,
                  mfaCodeProvider: async () => await promptSecret("Enter MFA code:"),
                });
              })
            : await withSpinner("Validating API key", async () => {
                const apiKey = await resolveApiKey(options.apiKey);
                return await runManualAuthFlow({
                  apiKey,
                  keypairPath: BAGS_KEYPAIR_PATH,
                });
              });

        const masked = `${credentials.apiKey.slice(0, 6)}...${credentials.apiKey.slice(-4)}`;
        await log(
          command,
          chalk.bold.green("\nSetup complete!\n") +
            `  Mode:    ${credentials.authMode ?? "wallet"}\n` +
            `  Wallet:  ${credentials.walletAddress}\n` +
            `  API Key: ${masked}\n` +
            `  RPC:     ${resolvedRpc}\n`,
        );
        await printData(command, {
          authMode: credentials.authMode ?? "wallet",
          walletAddress: credentials.walletAddress,
          apiKey: masked,
          rpcUrl: resolvedRpc,
        });
      }),
    );
}

async function resolveApiKey(rawApiKey: string | undefined): Promise<string> {
  const trimmed = rawApiKey?.trim();
  if (trimmed) {
    return trimmed;
  }

  if (!process.stdin.isTTY) {
    throw new Error(
      "Manual auth mode requires --api-key (or --input-json '{\"apiKey\":\"...\"}') in non-interactive environments.",
    );
  }

  const prompted = (await promptSecret("Enter API key:")).trim();
  if (!prompted) {
    throw new Error("Manual auth mode requires a non-empty API key.");
  }
  return prompted;
}
