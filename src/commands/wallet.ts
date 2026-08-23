import { Command } from "commander";
import { Connection, PublicKey } from "@solana/web3.js";
import { wrapAction } from "../lib/command.js";
import { loadCliConfig } from "../lib/config.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import {
  BAGS_KEYPAIR_PATH,
} from "../lib/paths.js";
import {
  generateKeypair,
  importKeypairFromBase58,
  importKeypairFromJsonFile,
  loadKeypair,
} from "../lib/wallet.js";
import { lamportsToSol } from "../utils/format.js";

type GenerateOptions = {
  force?: boolean;
};

type ImportOptions = {
  key?: string;
  file?: string;
};

type BalanceOptions = {
  rpc?: string;
  token?: string;
};

type LookupOptions = {
  username?: string;
  provider?: string;
  chain?: string;
};

type LookupBulkOptions = {
  items?: string;
};

function serializeWalletState(state: any): Record<string, unknown> {
  return {
    ...state,
    wallet: state.chain === "EVM" ? state.wallet : (state.wallet as PublicKey).toBase58(),
  };
}

export function registerWalletCommands(program: Command): void {
  const wallet = program.command("wallet").description("Wallet management commands");

  wallet
    .command("generate")
    .description("Generate and save a new local Solana keypair")
    .option("--force", "Overwrite existing keypair")
    .action(
      wrapAction(async (command, options: GenerateOptions) => {
        const kp = await generateKeypair(Boolean(options.force));
        await printData(command, { publicKey: kp.publicKey.toBase58(), path: BAGS_KEYPAIR_PATH });
      }),
    );

  wallet
    .command("import")
    .description("Import keypair from base58 key or JSON secret file")
    .option("--key <base58>", "Base58 private key")
    .option("--file <path>", "JSON file containing secret key bytes")
    .action(
      wrapAction(async (command, options: ImportOptions) => {
        let kp;
        if (options.key) {
          kp = await importKeypairFromBase58(options.key);
        } else if (options.file) {
          kp = await importKeypairFromJsonFile(options.file);
        } else {
          const method = await flagOrPrompt(undefined, "Import method (key/file):");
          if (method === "file") {
            const file = await flagOrPrompt(undefined, "Path to keypair JSON file:");
            kp = await importKeypairFromJsonFile(file);
          } else {
            const key = await flagOrPrompt(undefined, "Base58 private key:");
            kp = await importKeypairFromBase58(key);
          }
        }
        await printData(command, { publicKey: kp.publicKey.toBase58(), path: BAGS_KEYPAIR_PATH });
      }),
    );

  wallet
    .command("show")
    .description("Show wallet address and SOL balance")
    .option("--rpc <url>", "Override RPC URL")
    .action(
      wrapAction(async (command, options: BalanceOptions) => {
        const kp = await loadKeypair();
        if (!kp) {
          throw new Error("No local keypair found. Run `bags wallet generate` or `bags wallet import`.");
        }
        const config = await loadCliConfig();
        const connection = new Connection(options.rpc ?? config.rpcUrl, config.commitment);
        let sol = "unknown";
        try {
          const lamports = await connection.getBalance(kp.publicKey, config.commitment);
          sol = `${lamportsToSol(lamports)} SOL`;
        } catch {
          // RPC may be unreachable; still show the address
        }
        await printData(command, {
          publicKey: kp.publicKey.toBase58(),
          balance: sol,
          keypairPath: BAGS_KEYPAIR_PATH,
        });
      }),
    );

  wallet
    .command("balance")
    .description("Show SOL or SPL token balance")
    .option("--rpc <url>", "Override RPC URL")
    .option("--token <mint>", "SPL token mint address")
    .action(
      wrapAction(async (command, options: BalanceOptions) => {
        const kp = await loadKeypair();
        if (!kp) {
          throw new Error("No local keypair found.");
        }
        const config = await loadCliConfig();
        const connection = new Connection(options.rpc ?? config.rpcUrl, config.commitment);

        if (options.token) {
          const mint = new PublicKey(options.token);
          const accounts = await connection.getParsedTokenAccountsByOwner(kp.publicKey, { mint });
          if (accounts.value.length === 0) {
            await printData(command, {
              publicKey: kp.publicKey.toBase58(),
              token: mint.toBase58(),
              balance: "0",
            });
            return;
          }
          const info = accounts.value[0].account.data.parsed.info.tokenAmount;
          await printData(command, {
            publicKey: kp.publicKey.toBase58(),
            token: mint.toBase58(),
            balance: `${info.uiAmountString} (raw: ${info.amount})`,
          });
          return;
        }

        const lamports = await connection.getBalance(kp.publicKey, config.commitment);
        await printData(command, {
          publicKey: kp.publicKey.toBase58(),
          balance: `${lamportsToSol(lamports)} SOL`,
        });
      }),
    );

  wallet
    .command("lookup")
    .description("Look up a launch wallet by social username")
    .option("--username <username>", "Social username")
    .option("--provider <provider>", "Social provider (twitter, tiktok, kick, github)")
    .option("--chain <chain>", "Chain to resolve the wallet on (SOL or EVM)", "SOL")
    .action(
      wrapAction(async (command, options: LookupOptions) => {
        const username = await flagOrPrompt(options.username, "Username:");
        const provider = await flagOrPrompt(options.provider, "Provider (twitter/tiktok/kick/github):");
        const chain = (options.chain ?? "SOL").toUpperCase();
        const { sdk } = await getSdkContext();
        const state = await (sdk as any).state.getLaunchWalletV2(username, provider, chain as "SOL" | "EVM");
        await printData(command, serializeWalletState(state));
      }),
    );

  wallet
    .command("lookup-bulk")
    .description("Look up launch wallets for multiple social usernames")
    .option("--items <json>", 'JSON array of {"username","provider","chain"?} (chain defaults to SOL)')
    .action(
      wrapAction(async (command, options: LookupBulkOptions) => {
        const itemsInput = await flagOrPrompt(options.items, "Lookup items (JSON array):");
        const items = JSON.parse(itemsInput);
        if (!Array.isArray(items)) {
          throw new Error("--items must be a JSON array.");
        }
        const { sdk } = await getSdkContext();
        const results = await (sdk as any).state.getLaunchWalletV2Bulk(items);
        await printData(command, (results as any[]).map(serializeWalletState));
      }),
    );
}
