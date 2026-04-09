import bs58 from "bs58";
import nacl from "tweetnacl";
import { Keypair } from "@solana/web3.js";
import { loadKeypair, saveKeypair } from "./wallet.js";
import { BAGS_KEYPAIR_PATH } from "./paths.js";
import { BagsCredentials, saveCredentials } from "./credentials.js";

const BAGS_BASE_URL = "https://public-api-v2.bags.fm/api/v1";

type InitResponse = {
  message: string;
  nonce: string;
};

type CallbackResponse = {
  apiKey?: string;
  keyId?: string;
  mfaRequired?: boolean;
  authCode?: string;
};

async function post<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const response = await fetch(`${BAGS_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const json = (await response.json()) as {
    success: boolean;
    response?: T;
    error?: string;
  };

  if (!response.ok || !json.success || !json.response) {
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  }

  return json.response;
}

export async function getOrCreateAuthKeypair(path = BAGS_KEYPAIR_PATH): Promise<Keypair> {
  const existing = await loadKeypair(path);
  if (existing) {
    return existing;
  }
  const kp = Keypair.generate();
  await saveKeypair(kp, path);
  return kp;
}

export async function authInit(address: string): Promise<InitResponse> {
  return await post<InitResponse>("/agent/v2/auth/init", { address });
}

export function signChallengeMessage(challengeMessageBase58: string, keypair: Keypair): string {
  const messageBytes = bs58.decode(challengeMessageBase58);
  const signatureBytes = nacl.sign.detached(messageBytes, keypair.secretKey);
  return bs58.encode(signatureBytes);
}

export async function authSignatureCallback(args: {
  signature: string;
  address: string;
  nonce: string;
  keyName: string;
}): Promise<CallbackResponse> {
  return await post<CallbackResponse>("/agent/v2/auth/callback", args);
}

export async function authMfaCallback(args: {
  authCode: string;
  mfaCode: string;
  keyName: string;
}): Promise<CallbackResponse> {
  return await post<CallbackResponse>("/agent/v2/auth/callback", args);
}

export async function runAgentAuthFlow(args: {
  keyName: string;
  keypairPath?: string;
  mfaCodeProvider?: () => Promise<string>;
}): Promise<BagsCredentials> {
  const keypair = await getOrCreateAuthKeypair(args.keypairPath);
  const address = keypair.publicKey.toBase58();

  const init = await authInit(address);
  const signature = signChallengeMessage(init.message, keypair);
  const first = await authSignatureCallback({
    signature,
    address,
    nonce: init.nonce,
    keyName: args.keyName,
  });

  let apiKey = first.apiKey;
  let keyId = first.keyId;

  if (!apiKey && first.mfaRequired) {
    if (!first.authCode) {
      throw new Error("MFA required, but no authCode returned by API.");
    }
    if (!args.mfaCodeProvider) {
      throw new Error("MFA required. Please provide an MFA code.");
    }
    const mfaCode = await args.mfaCodeProvider();
    const second = await authMfaCallback({
      authCode: first.authCode,
      mfaCode,
      keyName: args.keyName,
    });
    apiKey = second.apiKey;
    keyId = second.keyId;
  }

  if (!apiKey) {
    throw new Error("Authentication succeeded but API key was not returned.");
  }

  const credentials: BagsCredentials = {
    apiKey,
    keyId,
    walletAddress: address,
    authenticatedAt: new Date().toISOString(),
  };

  await saveCredentials(credentials);
  return credentials;
}
