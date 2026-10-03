import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt, promptConfirm } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

const CASHOUT_METHODS = ["venmo", "cashapp", "xmoney"] as const;
const HISTORY_MAX_LIMIT = 50;
const BULK_MAX_MINTS = 100;
const OBJECT_ID_HEX = /^[0-9a-fA-F]{24}$/;

type TokenOptions = { mint?: string };
type TokensOptions = { mints?: string };
type SetCashoutOptions = { mint?: string; method?: string; username?: string; skipConfirm?: boolean };
type HistoryOptions = { mint?: string; limit?: number; cursor?: string; status?: string };
type PayoutOptions = { id?: string };
type ClaimsOptions = { mint?: string; limit?: number; cursor?: string };

function parseMint(raw: string): string {
  return new PublicKey(raw.trim()).toBase58();
}

function parseLimit(limit: number | undefined): number | undefined {
  if (limit === undefined) return undefined;
  if (!Number.isInteger(limit) || limit < 1 || limit > HISTORY_MAX_LIMIT) {
    throw new Error(`--limit must be an integer between 1 and ${HISTORY_MAX_LIMIT}.`);
  }
  return limit;
}

function parseObjectId(raw: string, name: string): string {
  const value = raw.trim();
  if (!OBJECT_ID_HEX.test(value)) {
    throw new Error(`${name} must be a 24 character hex id.`);
  }
  return value.toLowerCase();
}

function parseMints(raw: string): string[] {
  const mints = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
  if (mints.length < 1 || mints.length > BULK_MAX_MINTS) {
    throw new Error(`--mints must list between 1 and ${BULK_MAX_MINTS} token mints.`);
  }
  return mints.map(parseMint);
}

export function registerBagsPayoutCommands(program: Command): void {
  const payout = program.command("bags-payout").description("Bags payout token status, cashout, history and claims");

  payout
    .command("token")
    .description("Get payout status for a token (null when the token has no payout)")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: TokenOptions) => {
        const tokenMint = parseMint(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getToken(tokenMint);
        await printData(command, result);
      }),
    );

  payout
    .command("tokens")
    .description("Get payout status for several tokens, in input order")
    .option("--mints <csv>", `Comma-separated token mints (1-${BULK_MAX_MINTS})`)
    .action(
      wrapAction(async (command, options: TokensOptions) => {
        const tokenMints = parseMints(await flagOrPrompt(options.mints, "Token mints (comma-separated):"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getTokens(tokenMints);
        await printData(command, result);
      }),
    );

  payout
    .command("set-cashout")
    .description("Set the cashout destination for a token (manager only)")
    .option("--mint <address>", "Token mint")
    .option("--method <method>", `Cashout method: ${CASHOUT_METHODS.join(", ")}`)
    .option("--username <username>", "Cashout account username")
    .option("--skip-confirm", "Skip confirmation")
    .action(
      wrapAction(async (command, options: SetCashoutOptions) => {
        const tokenMint = parseMint(await flagOrPrompt(options.mint, "Token mint:"));
        const method = (await flagOrPrompt(options.method, `Cashout method (${CASHOUT_METHODS.join("/")}):`)).trim();
        if (!(CASHOUT_METHODS as readonly string[]).includes(method)) {
          throw new Error(`--method must be one of: ${CASHOUT_METHODS.join(", ")}.`);
        }
        const username = (await flagOrPrompt(options.username, "Cashout username:")).trim();
        if (username.length < 1 || username.length > 64) {
          throw new Error("--username must be between 1 and 64 characters.");
        }

        if (!options.skipConfirm) {
          const ok = await promptConfirm(`Set ${method} cashout to ${username} for ${tokenMint}?`);
          if (!ok) return;
        }

        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.setTokenCashout({
          tokenMint,
          cashout: { method, username },
        });
        await printData(command, result);
      }),
    );

  payout
    .command("history")
    .description("List payout history for a token")
    .option("--mint <address>", "Token mint")
    .option("--limit <n>", `Page size (1-${HISTORY_MAX_LIMIT})`, Number)
    .option("--cursor <id>", "Pagination cursor from a previous page")
    .option("--status <list>", "Comma-separated statuses or groups: in_progress, done, attention")
    .action(
      wrapAction(async (command, options: HistoryOptions) => {
        const tokenMint = parseMint(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getHistory({
          tokenMint,
          limit: parseLimit(options.limit),
          cursor: options.cursor ? parseObjectId(options.cursor, "--cursor") : undefined,
          status: options.status,
        });
        await printData(command, result);
      }),
    );

  payout
    .command("payout")
    .description("Get one payout by id, with claims (null when not found)")
    .option("--id <id>", "Payout id (24 hex characters)")
    .action(
      wrapAction(async (command, options: PayoutOptions) => {
        const id = parseObjectId(await flagOrPrompt(options.id, "Payout id:"), "--id");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getPayout(id);
        await printData(command, result);
      }),
    );

  payout
    .command("claims")
    .description("List claim history for a token")
    .option("--mint <address>", "Token mint")
    .option("--limit <n>", `Page size (1-${HISTORY_MAX_LIMIT})`, Number)
    .option("--cursor <id>", "Pagination cursor from a previous page")
    .action(
      wrapAction(async (command, options: ClaimsOptions) => {
        const tokenMint = parseMint(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).bagsPayout.getClaims({
          tokenMint,
          limit: parseLimit(options.limit),
          cursor: options.cursor ? parseObjectId(options.cursor, "--cursor") : undefined,
        });
        await printData(command, result);
      }),
    );
}
