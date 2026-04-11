import chalk from "chalk";
import { Command } from "commander";
import { parseAuthMode, resolveManualApiKey, runAgentAuthFlow, runManualAuthFlow } from "../lib/auth.js";
import { wrapAction } from "../lib/command.js";
import { clearCredentials, loadCredentials } from "../lib/credentials.js";
import { log, printData } from "../lib/output.js";
import { BAGS_KEYPAIR_PATH } from "../lib/paths.js";
import { promptSecret } from "../lib/prompt.js";
import { deleteKeypair } from "../lib/wallet.js";
import { maskApiKey } from "../utils/format.js";
import { withSpinner } from "../utils/spinner.js";

type LoginOptions = {
  keypair?: string;
  keyName?: string;
  authMode?: string;
  apiKey?: string;
};

type LogoutOptions = {
  all?: boolean;
};

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Agent authentication commands");

  auth
    .command("login")
    .description("Authenticate with wallet signature flow or a manual API key")
    .option("--keypair <path>", "Custom keypair path")
    .option("--key-name <name>", "Label for API key", "Bags CLI Key")
    .option("--auth-mode <mode>", "Authentication mode: wallet|manual", "wallet")
    .option("--api-key <key>", "API key (required when auth mode is manual)")
    .action(
      wrapAction(async (command, options: LoginOptions) => {
        const authMode = parseAuthMode(options.authMode);
        const credentials =
          authMode === "wallet"
            ? await withSpinner("Authenticating with Bags", async () => {
                return await runAgentAuthFlow({
                  keyName: options.keyName ?? "Bags CLI Key",
                  keypairPath: options.keypair ?? BAGS_KEYPAIR_PATH,
                  mfaCodeProvider: async () => await promptSecret("Enter MFA code:"),
                });
              })
            : await withSpinner("Validating API key", async () => {
                const apiKey = await resolveManualApiKey(options.apiKey);
                return await runManualAuthFlow({
                  apiKey,
                  keypairPath: options.keypair ?? BAGS_KEYPAIR_PATH,
                });
              });
        await log(command, chalk.green("Authentication successful."));
        await printData(command, {
          authMode: credentials.authMode ?? "wallet",
          walletAddress: credentials.walletAddress,
          keyId: credentials.keyId ?? null,
          authenticatedAt: credentials.authenticatedAt,
        });
      }),
    );

  auth
    .command("status")
    .description("Show current authentication state")
    .action(
      wrapAction(async (command) => {
        const credentials = await loadCredentials();
        if (!credentials) {
          await printData(command, { authenticated: false });
          await log(command, chalk.yellow("Not authenticated. Run `bags auth login`."));
          return;
        }
        const masked = maskApiKey(credentials.apiKey);
        await printData(command, {
          authenticated: true,
          authMode: credentials.authMode ?? "wallet",
          walletAddress: credentials.walletAddress,
          apiKey: masked,
          keyId: credentials.keyId ?? null,
          authenticatedAt: credentials.authenticatedAt,
        });
      }),
    );

  auth
    .command("logout")
    .description("Remove credentials. Optionally remove keypair too")
    .option("--all", "Also remove wallet keypair")
    .action(
      wrapAction(async (command, options: LogoutOptions) => {
        await clearCredentials();
        if (options.all) {
          await deleteKeypair();
        }
        await log(command, chalk.green(`Logged out${options.all ? " and deleted keypair" : ""}.`));
        await printData(command, { loggedOut: true, keypairDeleted: Boolean(options.all) });
      }),
    );
}
