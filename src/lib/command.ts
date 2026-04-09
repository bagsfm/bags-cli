import type { Command } from "commander";
import { handleCliError } from "../utils/errors.js";

export function wrapAction<T extends unknown[]>(
  fn: (command: Command, ...args: T) => Promise<void>,
): (...args: [...T, Command]) => Promise<void> {
  return async (...args: [...T, Command]) => {
    const command = args[args.length - 1] as Command;
    const rest = args.slice(0, -1) as T;
    try {
      await fn(command, ...rest);
    } catch (error) {
      handleCliError(error);
    }
  };
}
