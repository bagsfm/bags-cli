/**
 * Shell completion script generators and installation logic.
 *
 * Each generator emits a self-contained script that hooks into the
 * shell's native completion system. The scripts call `bags __complete`
 * dynamically on every Tab press so new commands are picked up without
 * regenerating the script. The generated scripts target the outer `bags`
 * binary (root) — the `__complete` protocol hook lives in `src/index.ts`,
 * not under `bags play`.
 *
 * Verbatim port of play-cli's `commands/completion/scripts.ts`.
 *
 * @packageDocumentation
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const COMPLETIONS_DIR = join(homedir(), ".bags", "completions");
const MARKER = "# Bags Play CLI completions";

/**
 * Zsh completion script.
 *
 * Uses `while IFS=<tab> read -r` with a heredoc to reliably parse the
 * three-field protocol. Groups by kind and calls `_describe -t <tag>`
 * per group.
 */
export const generateZshScript = (): string => `#compdef bags

_bags() {
  local -a commands options values
  local kind name desc output

  output="$(bags __complete -- "\${words[@]}" 2>/dev/null)"
  [[ -z "$output" ]] && return

  while IFS=$'\\t' read -r kind name desc; do
    [[ -z "$name" ]] && continue
    case "$kind" in
      command) commands+=("\${name}:\${desc}") ;;
      option)  options+=("\${name}:\${desc}") ;;
      value)   values+=("\${name}:\${desc}") ;;
    esac
  done <<< "$output"

  (( \${#commands} )) && _describe -t commands 'command' commands
  (( \${#options} ))  && _describe -t options 'option' options
  (( \${#values} ))   && _describe -t values 'value' values
}

compdef _bags bags
`;

/** Bash completion script (no descriptions; bash native compgen limitation). */
export const generateBashScript = (): string => `_bags() {
  local output
  output=$(bags __complete -- "\${COMP_WORDS[@]}" 2>/dev/null)
  if [[ $? -eq 0 ]]; then
    local -a names
    while IFS=$'\\t' read -r _kind name _desc; do
      [[ -n "$name" ]] && names+=("$name")
    done <<< "$output"
    COMPREPLY=($(compgen -W "\${names[*]}" -- "\${COMP_WORDS[COMP_CWORD]}"))
  fi
}

complete -o default -F _bags bags
`;

/** Fish completion script (renders name + description as two-column menu). */
export const generateFishScript = (): string => `function __bags_completions
  set -l tokens (commandline -cop)
  bags __complete -- $tokens 2>/dev/null | while read -l line
    set -l parts (string split \\t -- $line)
    if test (count $parts) -ge 3
      echo $parts[2]"\\t"$parts[3]
    else if test (count $parts) -ge 2
      echo $parts[2]
    end
  end
end

complete -c bags -f -a '(__bags_completions)'
`;

type ShellName = "bash" | "fish" | "zsh";

const GENERATORS: Record<ShellName, () => string> = {
	bash: generateBashScript,
	fish: generateFishScript,
	zsh: generateZshScript,
};

const FILE_NAMES: Record<ShellName, string> = {
	bash: "bags.bash",
	fish: "bags.fish",
	zsh: "bags.zsh",
};

/** Generate a completion script for the given shell. */
export const generateScript = (shell: string): string | undefined => {
	const gen = GENERATORS[shell as ShellName];
	return gen?.();
};

/**
 * Append a line to a file if the file exists (or `create` is true) and
 * does not already contain the completions marker. Returns true when
 * the file was modified.
 */
const ensureSourceLine = (
	filePath: string,
	line: string,
	create: boolean,
): boolean => {
	if (!(create || existsSync(filePath))) {
		return false;
	}
	if (existsSync(filePath)) {
		const content = readFileSync(filePath, "utf-8");
		if (content.includes(MARKER)) {
			return false;
		}
	}
	writeFileSync(filePath, `\n${MARKER}\n${line}\n`, { flag: "a" });
	return true;
};

/** Write all three completion scripts to `~/.bags/completions/`. */
const writeScriptFiles = (): void => {
	mkdirSync(COMPLETIONS_DIR, { recursive: true });

	for (const shell of Object.keys(GENERATORS) as ShellName[]) {
		const script = GENERATORS[shell]();
		writeFileSync(join(COMPLETIONS_DIR, FILE_NAMES[shell]), script);
	}
};

/** Add source lines to the user's primary shell config. */
const addPrimaryShellSource = (
	userShell: string,
	home: string,
	lines: { bash: string; fish: string; zsh: string },
): string[] => {
	const updated: string[] = [];

	if (userShell === "zsh") {
		if (ensureSourceLine(join(home, ".zshrc"), lines.zsh, true)) {
			updated.push("~/.zshrc");
		}
	} else if (userShell === "bash") {
		const target = existsSync(join(home, ".bash_profile"))
			? ".bash_profile"
			: ".bashrc";
		if (ensureSourceLine(join(home, target), lines.bash, true)) {
			updated.push(`~/${target}`);
		}
	} else if (userShell === "fish") {
		const fishConfig = join(home, ".config", "fish", "config.fish");
		mkdirSync(join(home, ".config", "fish"), { recursive: true });
		if (ensureSourceLine(fishConfig, lines.fish, true)) {
			updated.push("~/.config/fish/config.fish");
		}
	}

	return updated;
};

/** Add source lines to other shells' existing config files. */
const addCrossShellSources = (
	userShell: string,
	home: string,
	lines: { bash: string; zsh: string },
): string[] => {
	const updated: string[] = [];

	if (
		userShell !== "zsh" &&
		existsSync(join(home, ".zshrc")) &&
		ensureSourceLine(join(home, ".zshrc"), lines.zsh, false)
	) {
		updated.push("~/.zshrc");
	}
	if (
		userShell !== "bash" &&
		existsSync(join(home, ".bashrc")) &&
		ensureSourceLine(join(home, ".bashrc"), lines.bash, false)
	) {
		updated.push("~/.bashrc");
	}

	return updated;
};

/**
 * Write completion scripts to `~/.bags/completions/` and add source
 * lines to shell configuration files. Returns the list of updated
 * config files for user feedback.
 */
export const installCompletions = (): string[] => {
	writeScriptFiles();

	const home = homedir();
	const userShell = (process.env.SHELL ?? "sh").split("/").pop() ?? "sh";

	const lines = {
		bash: "[[ -f ~/.bags/completions/bags.bash ]] && source ~/.bags/completions/bags.bash",
		fish: "test -f ~/.bags/completions/bags.fish && source ~/.bags/completions/bags.fish",
		zsh: "[[ -f ~/.bags/completions/bags.zsh ]] && source ~/.bags/completions/bags.zsh",
	};

	const primary = addPrimaryShellSource(userShell, home, lines);
	const cross = addCrossShellSources(userShell, home, lines);

	return [...primary, ...cross];
};
