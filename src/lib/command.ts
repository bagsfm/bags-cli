import { Command } from "commander";
import { handleCliError } from "../utils/errors.js";

function mergeJsonInput(command: Command, args: unknown[]): unknown[] {
  const global = command.optsWithGlobals() as { inputJson?: string };
  if (!global.inputJson) return args;

  const parsed = JSON.parse(global.inputJson) as Record<string, unknown>;
  for (let i = args.length - 1; i >= 0; i--) {
    const arg = args[i];
    if (arg !== null && typeof arg === "object" && !Array.isArray(arg) && !(arg instanceof Command)) {
      args[i] = { ...(arg as Record<string, unknown>), ...parsed };
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
    const rest = mergeJsonInput(command, args.slice(0, -1)) as T;
    try {
      await fn(command, ...rest);
    } catch (error) {
      handleCliError(error);
    }
  };
}
