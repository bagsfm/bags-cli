import { readFile, rm } from "node:fs/promises";
import { BAGS_CREDENTIALS_PATH } from "./paths.js";
import { writeJsonSecure } from "./fs.js";

export type BagsCredentials = {
  apiKey: string;
  keyId?: string;
  authMode?: "wallet" | "manual";
  walletAddress: string;
  authenticatedAt: string;
};

export async function loadCredentials(): Promise<BagsCredentials | null> {
  try {
    const raw = await readFile(BAGS_CREDENTIALS_PATH, "utf8");
    const parsed = JSON.parse(raw) as Partial<BagsCredentials>;

    if (!parsed.apiKey || !parsed.walletAddress) {
      return null;
    }

    return {
      apiKey: parsed.apiKey,
      keyId: parsed.keyId,
      authMode: parsed.authMode === "manual" ? "manual" : "wallet",
      walletAddress: parsed.walletAddress,
      authenticatedAt: parsed.authenticatedAt ?? new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export async function saveCredentials(credentials: BagsCredentials): Promise<void> {
  await writeJsonSecure(BAGS_CREDENTIALS_PATH, credentials);
}

export async function clearCredentials(): Promise<void> {
  try {
    await rm(BAGS_CREDENTIALS_PATH, { force: true });
  } catch {
    // noop
  }
}
