import chalk from "chalk";
import { Command } from "commander";
import { runAgentAuthFlow } from "../lib/auth.js";
import { wrapAction } from "../lib/command.js";
import { clearCredentials, loadCredentials } from "../lib/credentials.js";
import { printData } from "../lib/output.js";
import { BAGS_KEYPAIR_PATH } from "../lib/paths.js";
import { promptSecret } from "../lib/prompt.js";
import { deleteKeypair } from "../lib/wallet.js";
import { withSpinner } from "../utils/spinner.js";

type LoginOptions = {
  keypair?: string;
  keyName?: string;
};

type LogoutOptions = {
  all?: boolean;
};

export function registerAuthCommands(program: Command): void {
  const auth = program.command("auth").description("Agent authentication commands");

  auth
    .command("login")
    .description("Authenticate via wallet signature flow and store API key")
    .option("--keypair <path>", "Custom keypair path")
    .option("--key-name <name>", "Label for API key", "Bags CLI Key")
    .action(
      wrapAction(async (command, options: LoginOptions) => {
        const credentials = await withSpinner("Authenticating with Bags", async () => {
          return await runAgentAuthFlow({
            keyName: options.keyName ?? "Bags CLI Key",
            keypairPath: options.keypair ?? BAGS_KEYPAIR_PATH,
            mfaCodeProvider: async () => await promptSecret("Enter MFA code"),
          });
        });
        console.log(chalk.green("Authentication successful."));
        await printData(command, {
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
          console.log(chalk.yellow("Not authenticated. Run `bags auth login`."));
          return;
        }
        const masked = `${credentials.apiKey.slice(0, 6)}...${credentials.apiKey.slice(-4)}`;
        await printData(command, {
          authenticated: true,
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
      wrapAction(async (_command, options: LogoutOptions) => {
        await clearCredentials();
        if (options.all) {
          await deleteKeypair();
        }
        console.log(chalk.green(`Logged out${options.all ? " and deleted keypair" : ""}.`));
      }),
    );
}
