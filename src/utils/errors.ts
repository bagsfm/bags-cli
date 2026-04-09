import chalk from "chalk";

function isUserAbort(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes("force closed") ||
    error.message.includes("SIGINT") ||
    error.name === "ExitPromptError"
  );
}

export function handleCliError(error: unknown): never {
  if (isUserAbort(error)) {
    console.log(chalk.dim("Goodbye."));
    process.exit(0);
  }
  if (error instanceof Error) {
    console.error(chalk.red(`Error: ${error.message}`));
  } else {
    console.error(chalk.red("Unexpected error"), error);
  }
  process.exit(1);
}
