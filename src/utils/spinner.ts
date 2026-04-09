import ora from "ora";

export async function withSpinner<T>(message: string, fn: () => Promise<T>): Promise<T> {
  const spinner = ora(message).start();
  try {
    const result = await fn();
    spinner.succeed(message);
    return result;
  } catch (error) {
    spinner.fail(`${message} failed`);
    throw error;
  }
}
