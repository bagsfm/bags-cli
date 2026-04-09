import { loadCliConfig } from "./config.js";
import { loadKeypair } from "./wallet.js";

export async function getLocalSigner() {
  const keypair = await loadKeypair();
  if (!keypair) {
    throw new Error("No local keypair found. Run `bags wallet generate` or `bags wallet import`.");
  }
  const config = await loadCliConfig();
  return { keypair, commitment: config.commitment };
}
