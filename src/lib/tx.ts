import { signAndSendTransaction } from "@bagsfm/bags-sdk";
import type { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";

export async function signAndSend(
  connection: Connection,
  commitment: "processed" | "confirmed" | "finalized",
  transaction: VersionedTransaction,
  keypair: Keypair,
): Promise<string> {
  const signature = await signAndSendTransaction(connection, commitment, transaction, keypair);
  return signature;
}

export async function signAndSendAll(
  connection: Connection,
  commitment: "processed" | "confirmed" | "finalized",
  transactions: Iterable<VersionedTransaction>,
  keypair: Keypair,
): Promise<string[]> {
  const signatures: string[] = [];
  for (const transaction of transactions) {
    signatures.push(await signAndSend(connection, commitment, transaction, keypair));
  }
  return signatures;
}
