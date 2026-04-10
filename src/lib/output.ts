import chalk from "chalk";
import Table from "cli-table3";
import type { Command } from "commander";
import { loadCliConfig } from "./config.js";

export async function shouldUseJson(command: Command): Promise<boolean> {
  const globalOpts = command.optsWithGlobals() as { json?: boolean };
  if (globalOpts.json) {
    return true;
  }
  const config = await loadCliConfig();
  return config.output === "json";
}

export function isJsonMode(command: Command): boolean {
  const globalOpts = command.optsWithGlobals() as { json?: boolean };
  return Boolean(globalOpts.json);
}

export function log(command: Command, ...args: unknown[]): void {
  if (!isJsonMode(command)) {
    console.log(...args);
  }
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) {
    return chalk.dim("—");
  }
  if (typeof value === "boolean") {
    return value ? chalk.green("yes") : chalk.red("no");
  }
  if (typeof value === "number") {
    return chalk.cyan(String(value));
  }
  return String(value);
}

function printKeyValue(data: Record<string, unknown>): void {
  const keys = Object.keys(data);
  const maxLen = Math.max(...keys.map((k) => k.length));
  for (const key of keys) {
    const val = data[key];
    if (val !== null && typeof val === "object" && !Array.isArray(val)) {
      console.log(`  ${chalk.bold(key.padEnd(maxLen))}:`);
      printKeyValue(val as Record<string, unknown>);
      continue;
    }
    if (Array.isArray(val)) {
      console.log(`  ${chalk.bold(key.padEnd(maxLen))}  ${chalk.dim(`[${val.length} items]`)}`);
      for (const item of val) {
        if (item !== null && typeof item === "object") {
          const summary = Object.entries(item as Record<string, unknown>)
            .map(([k, v]) => `${k}=${formatValue(v)}`)
            .join("  ");
          console.log(`    ${chalk.dim("•")} ${summary}`);
        } else {
          console.log(`    ${chalk.dim("•")} ${formatValue(item)}`);
        }
      }
      continue;
    }
    console.log(`  ${chalk.bold(key.padEnd(maxLen))}  ${formatValue(val)}`);
  }
}

export async function printData(command: Command, data: unknown): Promise<void> {
  if (await shouldUseJson(command)) {
    console.log(JSON.stringify(data, null, 2));
    return;
  }
  if (data !== null && typeof data === "object" && !Array.isArray(data)) {
    printKeyValue(data as Record<string, unknown>);
    return;
  }
  if (Array.isArray(data)) {
    for (const item of data) {
      if (item !== null && typeof item === "object") {
        printKeyValue(item as Record<string, unknown>);
        console.log();
      } else {
        console.log(formatValue(item));
      }
    }
    return;
  }
  console.log(formatValue(data));
}

export async function printTable(
  command: Command,
  headers: string[],
  rows: Array<Array<string | number | boolean>>,
): Promise<void> {
  if (await shouldUseJson(command)) {
    const keys = headers.map((h) => h.toLowerCase().replace(/\s+/g, "_"));
    const mapped = rows.map((row) => {
      const item: Record<string, string | number | boolean> = {};
      keys.forEach((key, i) => {
        item[key] = row[i] ?? "";
      });
      return item;
    });
    console.log(JSON.stringify(mapped, null, 2));
    return;
  }

  const table = new Table({ head: headers });
  for (const row of rows) {
    table.push(row);
  }
  console.log(table.toString());
}
