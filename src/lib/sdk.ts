import { Connection } from "@solana/web3.js";
import { BagsSDK } from "@bagsfm/bags-sdk";
import { loadCredentials } from "./credentials.js";
import { loadCliConfig } from "./config.js";

type SdkContext = {
  sdk: BagsSDK;
  connection: Connection;
};

let cached: SdkContext | null = null;

export async function getSdkContext(forceRefresh = false): Promise<SdkContext> {
  if (cached && !forceRefresh) {
    return cached;
  }

  const credentials = await loadCredentials();
  if (!credentials) {
    throw new Error("Not authenticated. Run `bags auth login` first.");
  }

  const config = await loadCliConfig();
  const connection = new Connection(config.rpcUrl, config.commitment);
  const sdk = new BagsSDK(credentials.apiKey, connection, config.commitment);

  cached = { sdk, connection };
  return cached;
}
