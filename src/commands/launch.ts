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

type FeeClaimerInput = {
  provider: "twitter" | "github" | "kick";
  username: string;
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

        const feeClaimersInput = parseFeeClaimers(options.feeClaimers);
        if (!options.skipConfirm) {
          const ok = await promptConfirm(
            `Launch ${name} (${symbol}) with initial buy ${initialBuy} lamports from ${keypair.publicKey.toBase58()}?`,
          );
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
          const inputBps = feeClaimersInput.reduce((sum, c) => sum + c.bps, 0);
          const creatorBps = 10000 - inputBps;
          if (creatorBps < 0) {
            throw new Error("Total fee claimer BPS exceeds 10000.");
          }
          if (creatorBps > 0) {
            feeClaimers.push({ user: keypair.publicKey, userBps: creatorBps });
          }
          for (const claimer of feeClaimersInput) {
            const user = await (sdk as any).state.getLaunchWalletV2(claimer.username, claimer.provider);
            feeClaimers.push({ user: user.wallet, userBps: claimer.bps });
          }
        } else {
          feeClaimers.push({ user: keypair.publicKey, userBps: 10000 });
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
}
