import { spawn } from "node:child_process";
import { readStream } from "../../utils/read-stream.js";
import type { ListedSkill } from "./types.js";

// biome-ignore lint: ESC control patterns trip the regex-control rule in literal form.
const ANSI_ESCAPE_PATTERN = new RegExp("\\u001b\\[[0-9;]*m", "g");
const LINE_BREAK_PATTERN = /\r?\n/;
const LEADING_WHITESPACE_PATTERN = /^\s*/;
const SKILL_NAME_PATTERN = /^[a-z][a-z0-9-]*$/;
const RESERVED_SKILL_LABELS = new Set([
	"available",
	"found",
	"list",
	"skills",
	"source",
	"tip",
]);

const stripAnsi = (value: string): string => {
	return value.replace(ANSI_ESCAPE_PATTERN, "");
};

const parseLineAfterPipe = (
	line: string,
): { content: string; leadingSpaces: number } | null => {
	const pipeIndex = line.indexOf("│");
	if (pipeIndex === -1) {
		return null;
	}

	const afterPipe = line.slice(pipeIndex + 1);
	const leadingSpaces =
		afterPipe.match(LEADING_WHITESPACE_PATTERN)?.[0].length ?? 0;
	const content = afterPipe.trim();

	return content ? { content, leadingSpaces } : null;
};

const isSkillNameToken = (content: string): boolean => {
	return (
		SKILL_NAME_PATTERN.test(content) && !RESERVED_SKILL_LABELS.has(content)
	);
};

const collectDescription = (
	lines: readonly string[],
	startIndex: number,
): { description: string; nextIndex: number } => {
	let description = "";
	let nextIndex = startIndex;

	while (nextIndex < lines.length) {
		const nextLine = lines[nextIndex];
		if (nextLine.includes("Use --skill")) {
			break;
		}

		const parsed = parseLineAfterPipe(nextLine);
		if (!parsed) {
			nextIndex++;
			continue;
		}

		const nextIsName =
			parsed.leadingSpaces <= 5 && isSkillNameToken(parsed.content);
		if (nextIsName) {
			break;
		}

		description += `${description ? " " : ""}${parsed.content}`;
		nextIndex++;
	}

	return { description, nextIndex };
};

export const parseSkillsListOutput = (stdout: string): ListedSkill[] => {
	const text = stripAnsi(stdout);
	const lines = text.split(LINE_BREAK_PATTERN);
	const skills: ListedSkill[] = [];
	let inSection = false;

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index];

		if (line.includes("Available Skills")) {
			inSection = true;
			continue;
		}
		if (!inSection || line.includes("Use --skill")) {
			continue;
		}

		const parsed = parseLineAfterPipe(line);
		if (!parsed) {
			continue;
		}

		const isCandidateName =
			parsed.leadingSpaces <= 5 && isSkillNameToken(parsed.content);
		if (!isCandidateName) {
			continue;
		}

		const { description, nextIndex } = collectDescription(lines, index + 1);
		skills.push({ description, name: parsed.content });
		index = nextIndex - 1;
	}

	return skills;
};

const runCommandCapture = async (
	command: string,
	args: readonly string[],
	directory: string,
): Promise<{ exitCode: number | null; stderr: string; stdout: string }> => {
	const childProcess = spawn(command, [...args], {
		cwd: directory,
		stdio: ["ignore", "pipe", "pipe"],
	});

	const [stdout, stderr, exitCode] = await Promise.all([
		readStream(childProcess.stdout),
		readStream(childProcess.stderr),
		new Promise<number | null>((resolve, reject) => {
			childProcess.on("error", reject);
			childProcess.on("close", resolve);
		}),
	]);

	return { exitCode, stderr, stdout };
};

export const listAvailableSkills = async (
	skillsRepo: string,
	directory: string,
): Promise<
	| { message?: string; ok: true; skills: ListedSkill[] }
	| { message: string; ok: false }
> => {
	try {
		const { exitCode, stderr, stdout } = await runCommandCapture(
			"bunx",
			["skills", "add", skillsRepo, "--list"],
			directory,
		);
		const combined = `${stdout}\n${stderr}`;

		if (exitCode !== 0) {
			return {
				message: stripAnsi(
					stderr.trim() || stdout.trim() || `skills exited with ${exitCode}`,
				),
				ok: false,
			};
		}

		return {
			ok: true,
			skills: parseSkillsListOutput(combined),
		};
	} catch (error) {
		return {
			message:
				error instanceof Error ? error.message : "Unknown error listing skills",
			ok: false,
		};
	}
};

export const installSkills = async (
	skillsRepo: string,
	skillNames: readonly string[],
	directory: string,
): Promise<void> => {
	if (skillNames.length === 0) {
		return;
	}

	const args: string[] = ["skills", "add", skillsRepo, "--agent", "*", "-y"];
	if (skillNames.length === 1 && skillNames[0] === "*") {
		args.push("--skill", "*");
	} else {
		args.push("--skill", ...skillNames);
	}

	const { exitCode, stderr } = await runCommandCapture("bunx", args, directory);
	if (exitCode !== 0) {
		throw new Error(stderr.trim() || `Command failed: bunx ${args.join(" ")}`);
	}
};
