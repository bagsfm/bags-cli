import chalk from "chalk";

export function handleCliError(error: unknown): never {
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  } else {
    console.error(chalk.red("Unexpected error"), error);
  }
  process.exit(1);
}
