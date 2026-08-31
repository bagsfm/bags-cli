import {
  BAGS_FEE_SHARE_V2_MAX_CLAIMERS_NON_LUT,
  createTipTransaction,
  sendBundleAndConfirm,
  waitForSlotsToPass,
} from "@bagsfm/bags-sdk";
import { LAMPORTS_PER_SOL, PublicKey, VersionedTransaction } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, flagOrPromptNumber, optionalFlagOrPrompt, promptConfirm, promptOneOf } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";
import { getLocalSigner } from "../lib/signer.js";
import { signAndSend } from "../lib/tx.js";
import chalk from "chalk";
import { confirm, input, select } from "@inquirer/prompts";
import { shortAddress } from "../utils/format.js";

const SOCIAL_PROVIDERS = ["twitter", "github", "kick", "tiktok"] as const;
type SocialProvider = (typeof SOCIAL_PROVIDERS)[number];
const MAX_CLAIMERS = 100;
const TOTAL_BPS = 10000;

type FeeClaimerInput = {
  provider?: SocialProvider;
  username?: string;
  wallet?: string;
  bps: number;
};

type LaunchCreateOptions = {
  name?: string;
  symbol?: string;
  description?: string;
  imageUrl?: string;
  image?: string;
  twitter?: string;
  website?: string;
  telegram?: string;
  initialBuy?: number;
  feeClaimers?: string;
  partner?: string;
  partnerConfig?: string;
  skipConfirm?: boolean;
};

type FeedOptions = { limit?: number };
type MintOptions = { mint?: string };
type ClaimVaultOptions = { kind?: string; wallet?: string; quoteMint?: string; skipConfirm?: boolean };
type DammV2CreateTransactionOptions = {
  tokenMint?: string;
  quoteMint?: string;
  metadataUrl?: string;
  feeClaimerWallet?: string;
  initialBuyQuoteAmount?: number;
  partner?: string;
};
type VaultClaimablesOptions = { wallet?: string };
type GetLaunchBulkOptions = { mints?: string };
type GetLaunchOptions = { mint?: string };
type DammV2LaunchesOptions = { limit?: number; quoteMint?: string; cursor?: string };

async function sendBundleWithTip(
  sdk: any,
  connection: any,
  keypair: any,
  unsignedTransactions: VersionedTransaction[],
): Promise<string> {
  const bundleBlockhash = unsignedTransactions[0]?.message.recentBlockhash;
  if (!bundleBlockhash) {
    throw new Error("Missing blockhash in bundle transaction.");
  }

  let tipLamports = Math.floor(0.015 * LAMPORTS_PER_SOL);
  try {
    const fees = await sdk.solana.getJitoRecentFees();
    if (fees?.landed_tips_95th_percentile) {
      tipLamports = Math.floor(Number(fees.landed_tips_95th_percentile) * LAMPORTS_PER_SOL);
    }
  } catch {
    // fallback tip
  }

  const tipTx = await createTipTransaction(connection, sdk.state.getCommitment(), keypair.publicKey, tipLamports, {
    blockhash: bundleBlockhash,
  });
  const signed = [tipTx, ...unsignedTransactions].map((tx) => {
    tx.sign([keypair]);
    return tx;
  });
  return await sendBundleAndConfirm(signed, sdk);
}

function parseFeeClaimers(raw?: string): FeeClaimerInput[] {
  if (!raw) {
    return [];
  }
  const parsed = JSON.parse(raw) as FeeClaimerInput[];
  if (!Array.isArray(parsed)) {
    throw new Error("--fee-claimers must be a JSON array.");
  }
  return parsed;
}

function formatClaimerLabel(claimer: FeeClaimerInput): string {
  return claimer.wallet
    ? `wallet:${shortAddress(claimer.wallet)}`
    : `${claimer.provider}:${claimer.username}`;
}

function printClaimerSummary(claimers: FeeClaimerInput[]): void {
  const usedBps = claimers.reduce((s, c) => s + c.bps, 0);
  console.log(chalk.dim("\n  Fee claimers:"));
  claimers.forEach((c, i) => {
    const label = formatClaimerLabel(c);
    console.log(`    ${i + 1}. ${label.padEnd(28)} ${(c.bps / 100).toFixed(2)}%`);
  });
  console.log(chalk.dim(`  Creator keeps: ${((TOTAL_BPS - usedBps) / 100).toFixed(2)}%\n`));
}

async function buildFeeClaimersInteractive(): Promise<FeeClaimerInput[]> {
  const shareFees = await confirm({ message: "Share fees with others?", default: false });
  if (!shareFees) {
    return [];
  }

  const claimers: FeeClaimerInput[] = [];
  let usedBps = 0;

  while (claimers.length < MAX_CLAIMERS && usedBps < TOTAL_BPS) {
    const remaining = TOTAL_BPS - usedBps;
    console.log(chalk.dim(`\n  Adding fee claimer ${claimers.length + 1}/${MAX_CLAIMERS} (${remaining} BPS remaining)`));

    const type = await select({
      message: "Claimer type:",
      choices: [
        { name: "Social media account", value: "social" as const },
        { name: "Direct wallet address", value: "wallet" as const },
      ],
    });

    let claimer: FeeClaimerInput;

    if (type === "social") {
      const provider = await select({
        message: "Platform:",
        choices: SOCIAL_PROVIDERS.map((p) => ({ name: p, value: p })),
      });
      const username = await input({ message: "Username:" });
      if (!username.trim()) {
        throw new Error("Username is required.");
      }
      const bps = await inputBps(remaining);
      claimer = { provider, username: username.trim(), bps };
    } else {
      const wallet = await input({ message: "Wallet address:" });
      if (!wallet.trim()) {
        throw new Error("Wallet address is required.");
      }
      new PublicKey(wallet.trim());
      const bps = await inputBps(remaining);
      claimer = { wallet: wallet.trim(), bps };
    }

    claimers.push(claimer);
    usedBps += claimer.bps;
    printClaimerSummary(claimers);

    if (claimers.length >= MAX_CLAIMERS || usedBps >= TOTAL_BPS) {
      break;
    }

    const more = await confirm({ message: "Add another fee claimer?", default: true });
    if (!more) {
      break;
    }
  }

  return claimers;
}

async function inputBps(remaining: number): Promise<number> {
  const raw = await input({
    message: `Basis points (1-${remaining}, e.g. 3000 = 30%):`,
    validate: (val) => {
      const n = Number(val);
      if (!Number.isInteger(n) || n < 1 || n > remaining) {
        return `Enter a whole number between 1 and ${remaining}.`;
      }
      return true;
    },
  });
  return Number(raw);
}

export function registerLaunchCommands(program: Command): void {
  const launch = program.command("launch").description("Token launch flows");

  launch
    .command("create")
    .description("Create and launch a token")
    .option("--name <name>", "Token name")
    .option("--symbol <symbol>", "Token symbol")
    .option("--description <description>", "Token description")
    .option("--image-url <url>", "Image URL")
    .option("--image <path>", "Image file path")
    .option("--twitter <url>", "Twitter URL")
    .option("--website <url>", "Website URL")
    .option("--telegram <url>", "Telegram URL")
    .option("--initial-buy <lamports>", "Initial buy amount in lamports", Number)
    .option("--fee-claimers <json>", "JSON array of fee claimers")
    .option("--partner <pubkey>", "Partner wallet")
    .option("--partner-config <pubkey>", "Partner config PDA")
    .option("--skip-confirm", "Skip final confirmation")
    .action(
      wrapAction(async (command, options: LaunchCreateOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        const name = await flagOrPrompt(options.name, "Token name:");
        const symbol = await flagOrPrompt(options.symbol, "Token symbol:");
        const description = await flagOrPrompt(options.description, "Token description:");

        const imageChoice = await promptOneOf(
          { imageUrl: options.imageUrl, image: options.image },
          { imageUrl: "Image URL", image: "Image file path" },
          { imageUrl: "Image URL:", image: "Image file path:" },
        );
        const imageUrl = imageChoice.key === "imageUrl" ? imageChoice.value : undefined;
        const image = imageChoice.key === "image" ? imageChoice.value : undefined;

        const initialBuy = await flagOrPromptNumber(options.initialBuy, "Initial buy (lamports):", 10_000_000);
        const twitter = await optionalFlagOrPrompt(options.twitter, "Twitter URL (optional):");
        const website = await optionalFlagOrPrompt(options.website, "Website URL (optional):");
        const telegram = await optionalFlagOrPrompt(options.telegram, "Telegram URL (optional):");

        const feeClaimersInput = options.feeClaimers
          ? parseFeeClaimers(options.feeClaimers)
          : await buildFeeClaimersInteractive();

        if (!options.skipConfirm) {
          let summary = `Launch ${name} (${symbol}) with initial buy ${initialBuy} lamports from ${keypair.publicKey.toBase58()}`;
          if (feeClaimersInput.length > 0) {
            const allocBps = feeClaimersInput.reduce((s, c) => s + c.bps, 0);
            const lines = feeClaimersInput.map((c) => {
              const label = formatClaimerLabel(c);
              return `  ${label} ${(c.bps / 100).toFixed(2)}%`;
            });
            lines.push(`  creator: ${((TOTAL_BPS - allocBps) / 100).toFixed(2)}%`);
            summary += `\n\nFee split:\n${lines.join("\n")}`;
          } else {
            summary += "\n\nFee split: 100% to creator";
          }
          const ok = await promptConfirm(`${summary}\n\nProceed?`);
          if (!ok) {
            return;
          }
        }

        const metadata = await (sdk as any).tokenLaunch.createTokenInfoAndMetadata({
          imageUrl,
          imagePath: image,
          name,
          symbol: symbol.toUpperCase().replace("$", ""),
          description,
          twitter,
          website,
          telegram,
        });

        const tokenMint = new PublicKey(metadata.tokenMint);
        const feeClaimers: Array<{ user: PublicKey; userBps: number }> = [];

        if (feeClaimersInput.length > 0) {
          const allocatedBps = feeClaimersInput.reduce((sum, c) => sum + c.bps, 0);
          const creatorBps = TOTAL_BPS - allocatedBps;
          if (creatorBps < 0) {
            throw new Error("Total fee claimer BPS exceeds 10000.");
          }
          if (creatorBps > 0) {
            feeClaimers.push({ user: keypair.publicKey, userBps: creatorBps });
          }
          for (const claimer of feeClaimersInput) {
            if (claimer.wallet) {
              feeClaimers.push({ user: new PublicKey(claimer.wallet), userBps: claimer.bps });
            } else if (claimer.username && claimer.provider) {
              const user = await (sdk as any).state.getLaunchWalletV2(claimer.username, claimer.provider);
              feeClaimers.push({ user: user.wallet, userBps: claimer.bps });
            } else {
              throw new Error("Each fee claimer must have either wallet or provider+username.");
            }
          }
        } else {
          feeClaimers.push({ user: keypair.publicKey, userBps: TOTAL_BPS });
        }

        let additionalLookupTables: PublicKey[] | undefined;
        if (feeClaimers.length > BAGS_FEE_SHARE_V2_MAX_CLAIMERS_NON_LUT) {
          const lutResult = await (sdk as any).config.getConfigCreationLookupTableTransactions({
            payer: keypair.publicKey,
            baseMint: tokenMint,
            feeClaimers,
          });
          await signAndSend(connection, commitment, lutResult.creationTransaction, keypair);
          await waitForSlotsToPass(connection, commitment, 1);
          for (const tx of lutResult.extendTransactions) {
            await signAndSend(connection, commitment, tx, keypair);
          }
          additionalLookupTables = lutResult.lutAddresses;
        }

        const configResult = await (sdk as any).config.createBagsFeeShareConfig({
          payer: keypair.publicKey,
          baseMint: tokenMint,
          feeClaimers,
          partner: options.partner ? new PublicKey(options.partner) : undefined,
          partnerConfig: options.partnerConfig ? new PublicKey(options.partnerConfig) : undefined,
          additionalLookupTables,
        });

        if (Array.isArray(configResult.bundles)) {
          for (const bundle of configResult.bundles) {
            await sendBundleWithTip(sdk, connection, keypair, bundle);
          }
        }
        if (Array.isArray(configResult.transactions)) {
          for (const tx of configResult.transactions) {
            await signAndSend(connection, commitment, tx, keypair);
          }
        }

        const launchTx = await (sdk as any).tokenLaunch.createLaunchTransaction({
          metadataUrl: metadata.tokenMetadata,
          tokenMint,
          launchWallet: keypair.publicKey,
          initialBuyLamports: initialBuy,
          configKey: configResult.meteoraConfigKey,
        });
        const signature = await signAndSend(connection, commitment, launchTx, keypair);
        await printData(command, {
          tokenMint: metadata.tokenMint,
          metadataUrl: metadata.tokenMetadata,
          configKey: configResult.meteoraConfigKey?.toString?.() ?? configResult.meteoraConfigKey,
          signature,
        });
      }),
    );

  launch
    .command("feed")
    .description("Get token launch feed")
    .option("--limit <n>", "Number of items", Number)
    .action(
      wrapAction(async (command, options: FeedOptions) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getTokenLaunchFeed({ limit: options.limit ?? 20 });
        await printData(command, result);
      }),
    );

  launch
    .command("damm-v2-launches")
    .description("Get confirmed DAMM v2 direct launches")
    .option("--limit <n>", "Number of items", Number)
    .option("--quote-mint <address>", "Filter by quote mint")
    .option("--cursor <id>", "Pagination cursor from a previous response's nextCursor")
    .action(
      wrapAction(async (command, options: DammV2LaunchesOptions) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).tokenLaunch.getDammV2Launches({
          limit: options.limit,
          quoteMint: options.quoteMint ? new PublicKey(options.quoteMint) : undefined,
          cursor: options.cursor,
        });
        await printData(command, result);
      }),
    );

  launch
    .command("creators")
    .description("Get creators for a token mint")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).state.getTokenCreators(mint);
        await printData(command, result);
      }),
    );

  launch
    .command("get")
    .description("Get a token launch by mint")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: GetLaunchOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).tokenLaunch.getTokenLaunch(mint);
        await printData(command, result);
      }),
    );

  launch
    .command("get-bulk")
    .description("Get token launches for up to 100 mints")
    .option("--mints <addresses>", "Comma-separated token mints (1-100, unique)")
    .action(
      wrapAction(async (command, options: GetLaunchBulkOptions) => {
        const mintsInput = await flagOrPrompt(options.mints, "Token mints (comma-separated):");
        const mints = mintsInput
          .split(",")
          .map((mint) => mint.trim())
          .filter(Boolean)
          .map((mint) => new PublicKey(mint));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).tokenLaunch.getTokenLaunchesBulk(mints);
        await printData(command, result);
      }),
    );

  launch
    .command("damm-v2-supported-quote-tokens")
    .description("Get quote mints usable for DAMM v2 direct launches")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).tokenLaunch.getDammV2SupportedQuoteTokens();
        await printData(command, result);
      }),
    );

  launch
    .command("damm-v2-vault-claimables")
    .description("Get partner/deployer DAMM v2 vault balances for a wallet")
    .option("--wallet <address>", "Partner/deployer wallet")
    .action(
      wrapAction(async (command, options: VaultClaimablesOptions) => {
        const wallet = new PublicKey(await flagOrPrompt(options.wallet, "Wallet:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).tokenLaunch.getDammV2VaultClaimables(wallet);
        await printData(command, result);
      }),
    );

  launch
    .command("damm-v2-create-transaction")
    .description("Build a DAMM v2 direct launch transaction bundle (does not sign or submit)")
    .option("--token-mint <address>", "Mint from a previous 'launch create-token-info'")
    .option("--quote-mint <address>", "Quote mint eligible at build time - badged and in the Jupiter trending-stocks whitelist (see damm-v2-supported-quote-tokens)")
    .option("--metadata-url <url>", "Metadata URI from a previous 'launch create-token-info'")
    .option("--fee-claimer-wallet <address>", "Receives the 50% fee position NFT (defaults to the local wallet)")
    .option("--initial-buy-quote-amount <n>", "Initial buy amount in quote mint base units", Number)
    .option("--partner <address>", "Existing PartnerConfig wallet to attach")
    .action(
      wrapAction(async (command, options: DammV2CreateTransactionOptions) => {
        const { sdk } = await getSdkContext();
        const { keypair } = await getLocalSigner();

        const tokenMint = new PublicKey(await flagOrPrompt(options.tokenMint, "Token mint:"));
        const quoteMint = new PublicKey(await flagOrPrompt(options.quoteMint, "Quote mint:"));
        const metadataUrl = await flagOrPrompt(options.metadataUrl, "Metadata URL:");
        const feeClaimerWallet = await optionalFlagOrPrompt(
          options.feeClaimerWallet,
          "Fee claimer wallet (optional, defaults to local wallet):",
        );
        const partner = await optionalFlagOrPrompt(options.partner, "Partner wallet (optional):");

        const result = await (sdk as any).tokenLaunch.createDammV2LaunchTransaction({
          metadataUrl,
          tokenMint,
          wallet: keypair.publicKey,
          quoteMint,
          feeClaimerWallet: feeClaimerWallet ? new PublicKey(feeClaimerWallet) : undefined,
          initialBuyQuoteAmount: options.initialBuyQuoteAmount,
          partner: partner ? new PublicKey(partner) : undefined,
        });

        await printData(command, result);
      }),
    );

  launch
    .command("damm-v2-claim-vault")
    .description("Claim a partner/deployer DAMM v2 vault to the local wallet")
    .option("--kind <partner|deployer>", "Which aggregate vault to sweep")
    .option("--quote-mint <address>", "Quote mint of the vault to sweep")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: ClaimVaultOptions) => {
        const { sdk, connection } = await getSdkContext();
        const { keypair, commitment } = await getLocalSigner();

        const kindInput = await flagOrPrompt(options.kind, "Vault kind (partner/deployer):");
        if (kindInput !== "partner" && kindInput !== "deployer") {
          throw new Error("Kind must be 'partner' or 'deployer'.");
        }
        const quoteMint = new PublicKey(await flagOrPrompt(options.quoteMint, "Quote mint:"));

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Claim ${kindInput} vault for ${keypair.publicKey.toBase58()} (quote mint ${quoteMint.toBase58()})?`);
          if (!ok) return;
        }

        const { transaction, claimable } = await (sdk as any).tokenLaunch.claimDammV2Vault({
          kind: kindInput,
          wallet: keypair.publicKey,
          quoteMint,
        });
        const signature = await signAndSend(connection, commitment, transaction, keypair);
        await printData(command, { signature, claimable });
      }),
    );
}
