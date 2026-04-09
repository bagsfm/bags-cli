import { readFile } from "node:fs/promises";
import { BAGS_SETTINGS_PATH } from "./paths.js";
import { writeJsonSecure } from "./fs.js";

export type OutputMode = "pretty" | "table" | "json";

export type CliConfig = {
  rpcUrl: string;
  commitment: "processed" | "confirmed" | "finalized";
  output: OutputMode;
};

export const DEFAULT_CLI_CONFIG: CliConfig = {
  rpcUrl: "https://api.mainnet-beta.solana.com",
  commitment: "processed",
  output: "pretty",
};

export async function loadCliConfig(): Promise<CliConfig> {
  try {
    const raw = await readFile(BAGS_SETTINGS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<CliConfig>;
    return {
      rpcUrl: parsed.rpcUrl ?? DEFAULT_CLI_CONFIG.rpcUrl,
      commitment: parsed.commitment ?? DEFAULT_CLI_CONFIG.commitment,
      output: parsed.output ?? DEFAULT_CLI_CONFIG.output,
    };
  } catch {
    return DEFAULT_CLI_CONFIG;
  }
}

export async function saveCliConfig(value: CliConfig): Promise<void> {
  await writeJsonSecure(BAGS_SETTINGS_PATH, value);
}
