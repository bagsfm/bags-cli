import { PublicKey } from "@solana/web3.js";
import { Command } from "commander";
import { wrapAction } from "../lib/command.js";
import { printData } from "../lib/output.js";
import { flagOrPrompt } from "../lib/prompt.js";
import { getSdkContext } from "../lib/sdk.js";

type MintOptions = {
  mint?: string;
  payload?: string;
};

type SubmitOptions = {
  mint?: string;
  companyName?: string;
  founders?: string;
  category?: string;
};

export function registerIncorporationCommands(program: Command): void {
  const inc = program.command("incorporation").description("Incorporation project flows");

  inc
    .command("pay")
    .description("Start incorporation payment")
    .option("--mint <address>", "Token mint")
    .option("--payload <json>", "Raw JSON payload override")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = await flagOrPrompt(options.mint, "Token mint:");
        const { sdk } = await getSdkContext();
        const payload =
          options.payload !== undefined
            ? (JSON.parse(options.payload) as Record<string, unknown>)
            : { tokenMint: mint };
        const result = await (sdk as any).incorporation.startPayment(payload);
        await printData(command, result);
      }),
    );

  inc
    .command("submit")
    .description("Submit incorporation details")
    .option("--mint <address>", "Token mint")
    .option("--company-name <name>", "Company name")
    .option("--founders <json>", "JSON founders array")
    .option("--category <value>", "Project category")
    .action(
      wrapAction(async (command, options: SubmitOptions) => {
        const mint = await flagOrPrompt(options.mint, "Token mint:");
        const companyName = await flagOrPrompt(options.companyName, "Company name:");
        const foundersRaw = await flagOrPrompt(options.founders, "Founders JSON:");
        const category = await flagOrPrompt(options.category, "Category:");
        const founders = JSON.parse(foundersRaw) as unknown[];
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).incorporation.incorporate({
          tokenMint: mint,
          companyName,
          founders,
          category,
        });
        await printData(command, result);
      }),
    );

  inc
    .command("start")
    .description("Start incorporation process")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = await flagOrPrompt(options.mint, "Token mint:");
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).incorporation.startIncorporation({ tokenMint: mint });
        await printData(command, result);
      }),
    );

  inc
    .command("list")
    .description("List incorporation projects for API key")
    .action(
      wrapAction(async (command) => {
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).incorporation.list();
        await printData(command, result);
      }),
    );

  inc
    .command("details")
    .description("Get incorporation details by token mint")
    .option("--mint <address>", "Token mint")
    .action(
      wrapAction(async (command, options: MintOptions) => {
        const mint = new PublicKey(await flagOrPrompt(options.mint, "Token mint:"));
        const { sdk } = await getSdkContext();
        const result = await (sdk as any).incorporation.getDetails(mint);
        await printData(command, result);
      }),
    );
}
