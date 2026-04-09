import { readFile, rm } from "node:fs/promises";
import { Keypair } from "@solana/web3.js";
import bs58 from "bs58";
import { BAGS_KEYPAIR_PATH } from "./paths.js";
import { writeJsonSecure } from "./fs.js";

function keypairFromSecret(secret: Uint8Array): Keypair {
  return Keypair.fromSecretKey(secret);
}

export async function loadKeypair(path: string = BAGS_KEYPAIR_PATH): Promise<Keypair | null> {
  try {
    const raw = await readFile(path, "utf8");
    const parsed = JSON.parse(raw) as number[];
    return keypairFromSecret(Uint8Array.from(parsed));
  } catch {
    return null;
  }
}

export async function saveKeypair(keypair: Keypair, path: string = BAGS_KEYPAIR_PATH): Promise<void> {
  await writeJsonSecure(path, Array.from(keypair.secretKey));
}

export async function generateKeypair(force = false, path: string = BAGS_KEYPAIR_PATH): Promise<Keypair> {
  const existing = await loadKeypair(path);
  if (existing && !force) {
    throw new Error(`Keypair already exists at ${path}. Use --force to overwrite.`);
  }
  const kp = Keypair.generate();
  await saveKeypair(kp, path);
  return kp;
}

export async function importKeypairFromBase58(base58PrivateKey: string, path: string = BAGS_KEYPAIR_PATH): Promise<Keypair> {
  const secret = bs58.decode(base58PrivateKey);
  const kp = keypairFromSecret(secret);
  await saveKeypair(kp, path);
  return kp;
}

export async function importKeypairFromJsonFile(filePath: string, path: string = BAGS_KEYPAIR_PATH): Promise<Keypair> {
  const raw = await readFile(filePath, "utf8");
  const parsed = JSON.parse(raw) as number[];
  const kp = keypairFromSecret(Uint8Array.from(parsed));
  await saveKeypair(kp, path);
  return kp;
}

export function detectKeyFormat(raw: string): "base58" | "intArray" {
  const trimmed = raw.trim();
  if (trimmed.startsWith("[") || /^\d+\s*,/.test(trimmed)) {
    return "intArray";
  }
  return "base58";
}

export async function importKeypairFromIntArray(
  intArrayStr: string,
  path: string = BAGS_KEYPAIR_PATH,
): Promise<Keypair> {
  let input = intArrayStr.trim();
  if (!input.startsWith("[")) {
    input = `[${input}]`;
  }
  const parsed = JSON.parse(input) as number[];
  if (!Array.isArray(parsed) || !parsed.every((n) => Number.isInteger(n))) {
    throw new Error("Invalid int array format.");
  }
  const kp = keypairFromSecret(Uint8Array.from(parsed));
  await saveKeypair(kp, path);
  return kp;
}

export async function deleteKeypair(path: string = BAGS_KEYPAIR_PATH): Promise<void> {
  try {
    await rm(path, { force: true });
  } catch {
    // noop
  }
}
