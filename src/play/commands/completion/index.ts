/**
 * `bags play completion` — generate and install shell completion scripts.
 *
 * The user-facing command lives at `bags play completion` per locked
 * decision D5 (strict nesting). The protocol hook the generated scripts
 * call (`bags __complete -- <words>`) lives at the root binary in
 * [src/index.ts](../../../index.ts) — shell completion mechanically
 * requires the dispatcher at the binary's outermost level.
 *
 * @packageDocumentation
 */

import type { Command } from "commander";
import { addExamplesAfter } from "../../utils/help.js";
import { showError, showSuccess } from "../../utils/output.js";
import { generateScript, installCompletions } from "./scripts.js";

export { handleCompletion } from "./completer.js";

const SUPPORTED_SHELLS = ["bash", "fish", "zsh"] as const;
const USER_ERROR_EXIT_CODE = 1;

/** Registers `bags play completion <shell>` and `bags play completion --install`. */
export const registerCompletionCommand = (parent: Command): void => {
	const command = parent
		.command("completion")
		.description("Generate shell completion scripts")
		.argument("[shell]", "target shell (bash, zsh, fish)")
		.option("--install", "write completion files and update shell configs")
		.action(function (this: Command, shell?: string) {
			const globals = this.optsWithGlobals<{ json?: boolean }>();
			if (globals.json) {
				showError(
					"`bags play completion` outputs shell scripts and does not support `--json`.",
					{
						exitCode: USER_ERROR_EXIT_CODE,
						suggestion: "Omit `--json` when generating completions.",
					},
				);
				return;
			}

			const opts = this.opts<{ install?: boolean }>();

			if (opts.install) {
				const updated = installCompletions();
				if (updated.length > 0) {
					showSuccess(`Completions installed. Updated: ${updated.join(", ")}`);
				} else {
					showSuccess("Completions are already installed.");
				}
				return;
			}

			if (!shell) {
				showError("Missing shell argument.", {
					suggestion: "Usage: bags play completion <bash|zsh|fish>",
				});
				return;
			}

			if (
				!SUPPORTED_SHELLS.includes(shell as (typeof SUPPORTED_SHELLS)[number])
			) {
				showError(`Unsupported shell: ${shell}`, {
					suggestion: `Supported shells: ${SUPPORTED_SHELLS.join(", ")}`,
				});
				return;
			}

			const script = generateScript(shell);
			if (script) {
				process.stdout.write(script);
			}
		});

	addExamplesAfter(command, [
		{
			description: "Output zsh completions",
			command: "bags play completion zsh",
		},
		{
			description: "Output bash completions",
			command: "bags play completion bash",
		},
		{
			description: "Auto-install completions into shell config",
			command: "bags play completion --install",
		},
		{
			description: "Source directly (adds ~60ms to shell startup)",
			command: 'eval "$(bags play completion zsh)"',
		},
	]);
};
