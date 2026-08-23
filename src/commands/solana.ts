import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { getSdkContext } from "../lib/sdk.js";

type SendBundleOptions = { transactions?: string; region?: string };
type BundleStatusOptions = { bundleIds?: string; region?: string };

function parseStringArray(raw: string | undefined, flagName: string): string[] {
  if (!raw) {
    throw new Error(`${flagName} is required. Example: '["<base64-or-base58-tx>", ...]'`);
  }
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed) || parsed.some((item) => typeof item !== "string")) {
    throw new Error(`${flagName} must be a JSON array of strings.`);
  }
  return parsed;
}

export function registerSolanaCommands(program: Command): void {
  const solana = program.command("solana").description("Low-level Solana / Jito bundle commands");

  solana
    .command("send-bundle")
    .description("Submit a bundle of already-signed, serialized transactions to the Jito relayer network")
    .option("--transactions <json>", "JSON array of base64-encoded serialized signed transactions")
    .option("--region <region>", "Jito region (mainnet, amsterdam, frankfurt, ny, tokyo, slc, london, singapore)", "mainnet")
    .action(
      wrapAction(async (command, options: SendBundleOptions) => {
        const transactions = parseStringArray(options.transactions, "--transactions");
        const { sdk } = await getSdkContext();
        const bundleId = await (sdk as any).solana.sendBundle(transactions, options.region);
        await printData(command, { bundleId });
      }),
    );

  solana
    .command("bundle-status")
    .description("Get the latest status for one or more previously submitted Jito bundles")
    .option("--bundle-ids <json>", "JSON array of bundle IDs returned from send-bundle")
    .option("--region <region>", "Jito region the bundles were submitted to", "mainnet")
    .action(
      wrapAction(async (command, options: BundleStatusOptions) => {
        const bundleIds = parseStringArray(options.bundleIds, "--bundle-ids");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).solana.getBundleStatuses(bundleIds, options.region);
        await printData(command, result);
      }),
    );

  solana
    .command("jito-fees")
    .description("Get the latest Jito landed tip percentile metrics")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).solana.getJitoRecentFees();
        await printData(command, result);
      }),
    );
}
