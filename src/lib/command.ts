import { Command } from "commander";
import { handleCliError } from "../utils/errors.js";
import { parseJsonObject } from "./json.js";

function mergeJsonInput(command: Command, args: unknown[]): unknown[] {
  const global = command.optsWithGlobals() as { inputJson?: string };
  if (!global.inputJson) return args;

  const parsed = parseJsonObject(global.inputJson, "--input-json");
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
