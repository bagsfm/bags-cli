/**
 * Dynamic shell-completion handler.
 *
 * Called by shell completion scripts via `bags __complete -- <words…>`.
 * Walks the Commander command tree to produce context-aware completions.
 *
 * Output protocol — one completion per line, three tab-separated fields:
 *
 *   kind\tname\tdescription
 *
 * Where `kind` is `command`, `option`, or `value`. Shell scripts use
 * the kind to group completions (e.g. zsh `_describe -t commands`).
 *
 * Verbatim port of play-cli's completer (no library swaps required —
 * pure Commander tree traversal).
 *
 * @packageDocumentation
 */

import type { Command, Option } from "commander";

/** Completion group kind, used by shells for grouping and labelling. */
export type CompletionKind = "command" | "option" | "value";

/** A single completion candidate. */
export interface CompletionItem {
	kind: CompletionKind;
	name: string;
	description: string;
}

/**
 * Resolve the deepest matching {@link Command} in the tree for the given
 * words. Returns the resolved command, the index of the first unconsumed
 * word, and the set of options already present on the line.
 */
export const resolveCommand = (
	program: Command,
	words: string[],
): { command: Command; wordIndex: number; usedOptions: Set<string> } => {
	let current = program;
	let wordIndex = 0;
	const usedOptions = new Set<string>();

	while (wordIndex < words.length - 1) {
		const word = words[wordIndex] as string;

		if (word.startsWith("-")) {
			usedOptions.add(word);
			const matchingOpt = current.options.find(
				(o: Option) => o.short === word || o.long === word,
			);
			if (matchingOpt?.required) {
				wordIndex += 1;
			}
			wordIndex += 1;
			continue;
		}

		const sub = (current.commands as Command[]).find((c) => c.name() === word);
		if (sub) {
			current = sub;
		}
		wordIndex += 1;
	}

	return { command: current, wordIndex, usedOptions };
};

/**
 * Determine whether the previous word is an option that expects an argument.
 * If so, return that {@link Option} so we can suggest its `argChoices`.
 */
const findPendingOptionArg = (
	command: Command,
	words: string[],
): Option | undefined => {
	if (words.length < 2) {
		return undefined;
	}
	const prev = words.at(-2) as string;
	if (!prev.startsWith("-")) {
		return undefined;
	}

	return command.options.find(
		(o: Option) => (o.short === prev || o.long === prev) && o.required,
	);
};

/** Collect option completions matching the given partial flag prefix. */
const getOptionCompletions = (
	command: Command,
	partial: string,
	usedOptions: Set<string>,
): CompletionItem[] => {
	const items: CompletionItem[] = [];

	for (const opt of command.options as Option[]) {
		const isUsed =
			(opt.long && usedOptions.has(opt.long)) ||
			(opt.short && usedOptions.has(opt.short));
		if (isUsed || opt.hidden) {
			continue;
		}

		if (opt.long?.startsWith(partial)) {
			items.push({
				kind: "option",
				name: opt.long,
				description: opt.description,
			});
		} else if (opt.short?.startsWith(partial)) {
			items.push({
				kind: "option",
				name: opt.short,
				description: opt.description,
			});
		}
	}

	return items;
};

/** Collect subcommand completions matching the given partial name. */
const getSubcommandCompletions = (
	command: Command,
	partial: string,
): CompletionItem[] => {
	const helper = command.createHelp();
	const items: CompletionItem[] = [];

	for (const sub of helper.visibleCommands(command) as Command[]) {
		if (sub.name().startsWith(partial)) {
			items.push({
				kind: "command",
				name: sub.name(),
				description: sub.description(),
			});
		}
	}

	return items;
};

/**
 * Build the list of completion candidates for the current cursor position.
 */
export const getCompletions = (
	command: Command,
	partial: string,
	usedOptions: Set<string>,
	words: string[],
): CompletionItem[] => {
	const pendingOpt = findPendingOptionArg(command, words);
	if (pendingOpt?.argChoices) {
		return pendingOpt.argChoices
			.filter((c: string) => c.startsWith(partial))
			.map((c: string) => ({
				kind: "value" as const,
				name: c,
				description: "",
			}));
	}

	if (partial.startsWith("-")) {
		return getOptionCompletions(command, partial, usedOptions);
	}

	return getSubcommandCompletions(command, partial);
};

/** Format a {@link CompletionItem} as a protocol line: `kind\tname\tdescription`. */
const formatItem = (item: CompletionItem): string => {
	return item.description
		? `${item.kind}\t${item.name}\t${item.description}`
		: `${item.kind}\t${item.name}`;
};

/**
 * Main entry point called from the `__complete` fast-path in `src/index.ts`.
 * Writes completions to stdout and returns immediately.
 */
export const handleCompletion = (program: Command, words: string[]): void => {
	const effectiveWords = words.length === 0 ? [""] : words;

	const { command, usedOptions } = resolveCommand(program, effectiveWords);
	const partial = effectiveWords.at(-1) ?? "";
	const items = getCompletions(command, partial, usedOptions, effectiveWords);

	const output = items.map(formatItem).join("\n");

	if (output) {
		process.stdout.write(`${output}\n`);
	}
};
