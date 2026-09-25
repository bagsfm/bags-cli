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

/**
 * Signs and sends every stage of a native quote transaction plan, in order. The returned
 * `readiness` is `"ready"` once the plan fully executed, or `"setup_required"` when the plan
 * only contained a lookup table setup/warm-up step; re-run the originating command afterwards
 * to fetch the rebuilt plan.
 */
export async function signAndSendQuotePlan(
  connection: Connection,
  commitment: "processed" | "confirmed" | "finalized",
  keypair: Keypair,
  plan: { transactions: Array<{ transaction: VersionedTransaction }>; readiness: { status: string } },
): Promise<{ signatures: string[]; readiness: string }> {
  const signatures = await signAndSendAll(
    connection,
    commitment,
    plan.transactions.map((stage) => stage.transaction),
    keypair,
  );
  return { signatures, readiness: plan.readiness.status };
}
