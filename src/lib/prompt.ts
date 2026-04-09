import { confirm, input, password, select } from "@inquirer/prompts";

export async function flagOrPrompt(
  value: string | undefined,
  message: string,
  validate?: (value: string) => boolean | string,
): Promise<string> {
  if (value !== undefined && value !== "") {
    return value;
  }
  return await input({ message, validate });
}

export async function optionalFlagOrPrompt(value: string | undefined, message: string): Promise<string | undefined> {
  if (value !== undefined) {
    return value;
  }
  const next = await input({ message });
  return next.trim() === "" ? undefined : next;
}

export async function flagOrPromptNumber(
  value: number | undefined,
  message: string,
  defaultValue?: number,
): Promise<number> {
  if (value !== undefined) {
    return value;
  }
  const raw = await input({ message, default: defaultValue?.toString() });
  const n = Number(raw);
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid number: ${raw}`);
  }
  return n;
}

export async function promptConfirm(message: string, defaultValue = true): Promise<boolean> {
  return await confirm({ message, default: defaultValue });
}

export async function promptSecret(message: string): Promise<string> {
  return await password({ message, mask: "*" });
}

export async function promptOneOf<K extends string>(
  flags: Record<K, string | undefined>,
  labels: Record<K, string>,
  promptMessages: Record<K, string>,
): Promise<{ key: K; value: string }> {
  const keys = Object.keys(flags) as K[];
  const provided = keys.filter((k) => flags[k] !== undefined && flags[k] !== "");
  if (provided.length > 1) {
    throw new Error(`Only one of ${keys.map((k) => `--${String(k)}`).join(", ")} can be provided.`);
  }
  if (provided.length === 1) {
    return { key: provided[0], value: flags[provided[0]]! };
  }
  const key = await select({
    message: "Choose one:",
    choices: keys.map((k) => ({ name: labels[k], value: k })),
  });
  const value = await input({ message: promptMessages[key] });
  if (!value.trim()) {
    throw new Error(`A value is required.`);
  }
  return { key, value };
}
