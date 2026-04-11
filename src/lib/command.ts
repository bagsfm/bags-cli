import { Command } from "commander";
import { handleCliError } from "../utils/errors.js";

function parseInputJsonObject(raw: string): Record<string, unknown> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    throw new Error(`Invalid JSON for --input-json: ${detail}`);
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    const kind =
      parsed === null ? "null" : Array.isArray(parsed) ? "array" : typeof parsed;
    throw new Error(
      `--input-json must be a JSON object (e.g. '{"option":"value"}'), not ${kind}`,
    );
  }
  return parsed as Record<string, unknown>;
}

function mergeJsonInput(command: Command, args: unknown[]): unknown[] {
  const global = command.optsWithGlobals() as { inputJson?: string };
  if (!global.inputJson) return args;

  const parsed = parseInputJsonObject(global.inputJson);
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (arg !== null && typeof arg === "object" && !Array.isArray(arg) && !(arg instanceof Command)) {
      const cli = arg as Record<string, unknown>;
      const merged: Record<string, unknown> = { ...cli };
      for (const key of Object.keys(parsed)) {
        if (key === "inputJson") continue;
        if (command.getOptionValueSourceWithGlobals(key) === "cli") continue;
        merged[key] = parsed[key];
      }
      args[i] = merged;
      return args;
    }
  }
  return args;
}

export function wrapAction<T extends unknown[]>(
  fn: (command: Command, ...args: T) => Promise<void>,
): (...args: [...T, Command]) => Promise<void> {
  return async (...args: [...T, Command]) => {
    const command = args[args.length - 1] as Command;
    try {
      const rest = mergeJsonInput(command, args.slice(0, -1)) as T;
      await fn(command, ...rest);
    } catch (error) {
      handleCliError(error);
    }
  };
}
