/**
 * `bags play art` — neofetch-style display of the Bags logo with system info.
 *
 * Direct port of play-cli's `commands/art.ts` with the following swaps:
 * - `picocolors` → `chalk` (uniform with bags-cli's UX stack).
 * - `Bun.version` → `process.version` (binary runs on Node).
 * - `applyStyledHelp` → `addExamplesAfter` adapter (Commander's default help).
 *
 * @packageDocumentation
 */

import { cpus, freemem, hostname, release, totalmem, uptime } from "node:os";
import chalk from "chalk";
import type { Command } from "commander";
import { cliVersion } from "../../version.js";
import { accent, accentDim, cmd, label, muted } from "../utils/colors.js";
import { addExamplesAfter } from "../utils/help.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";

const PACKAGE_NAME = "@bagsfm/bags-cli";

const neoYellow = (v: string): string => chalk.bold(chalk.yellow(v));
const neoGreen = (v: string): string => chalk.bold(chalk.green(v));

const LOGO_LINES = [
	"              OhhOO",
	"            OhhóóóhhÖÖÖÖÖÖO",
	"          Ohh2óóóóóóóóóóóóOhO",
	"         OÖóóóóóóóóóóóóóóóóóhÖ",
	"         OÖOóóóóóóóóóóóóóóóOhO",
	"           OhOóóóóóóóóóóóOhh",
	"             hÖhó2ó2ó2óhÖÖO",
	"               OOOOOOOOO",
	"         OÖÖOO           ìOhÖO",
	"       OÖhóó2hhÖÖÖÖÖÖÖÖÖÖhOóóhhh",
	"     OÖOóóóóóóóóóóóóóóóóóóóóóóóOhO",
	"    Ohóóóóóóóó2ó2hhhhh22óóóóóóóóóhO",
	"   OOóóóóóOhhOOOOO   OOOOOhhOóóóóóOh",
	"  ÖOóóóóóOO                 OOóóóóóOÖ",
	" OOóóóóóóh        OOO        OóóóóóóOO",
	"OhóóóóóóóOO        'OOÖÖÖÖÖÖhOóóóóóóóhO",
	"O2óóóóóóóóhhOOO           OOhOóóóóóóóóO",
	"ÖóóóóóóóóOOhÖÖÖÖÖÖOO        ìhóóóóóóóóÖ",
	"hóóóóóóóóh        OÖO        hóóóóóóóóh",
	"hóóóóóóóóOO                 OOóóóóóóóóh",
	"OOóóóóóóóóhhOOOOOì   'OOOOOhhóóóóóóóó2h",
	"Ohóóóóóóóóóó2OhhhOOOOhhhhO2óóóóóóóóóóOO",
	" OOOóóóóóóóóóóóóóó2óóóóóóóóóóóóóóóóOOO",
	"   hOOóóóóóóóóóóóóóóóóóóóóóóóóóóóóOhì",
	"    OhOOOóóóóóóóóóóóóóóóóóóóóóOOhhO",
	"        OhhOOOOOóóóóóóó2OOOhhhO\u201E",
	"              OOhhhhhhhhO",
];

const LOGO_BRIGHT_THRESHOLD = 21;
const ART_INFO_GAP = "   ";
const INFO_START_ROW = 1;
const ART_WIDTH = Math.max(...LOGO_LINES.map((line) => line.length));

const CPU_TRADEMARK_PATTERN = /\(R\)|\(TM\)/gi;
const CPU_WHITESPACE_PATTERN = /\s+/g;

const PLATFORM_LABELS: Record<string, string> = {
	darwin: "macOS",
	linux: "Linux",
	win32: "Windows",
};

const KERNEL_NAMES: Record<string, string> = {
	darwin: "Darwin",
	linux: "Linux",
	win32: "Windows NT",
};

const infoRow = (key: string, value: string): string => {
	const keyWithColon = `${key}:`;
	const padding = " ".repeat(Math.max(1, 12 - keyWithColon.length));
	return `${neoYellow(keyWithColon)}${padding}${value}`;
};

const formatGiB = (bytes: number): string =>
	`${(bytes / 1024 ** 3).toFixed(1)} GiB`;

const formatUptime = (seconds: number): string => {
	const days = Math.floor(seconds / 86_400);
	const hours = Math.floor((seconds % 86_400) / 3600);
	const mins = Math.floor((seconds % 3600) / 60);

	const parts: string[] = [];
	if (days > 0) parts.push(`${days} day${days === 1 ? "" : "s"}`);
	if (hours > 0) parts.push(`${hours} hour${hours === 1 ? "" : "s"}`);
	if (mins > 0) parts.push(`${mins} min${mins === 1 ? "" : "s"}`);
	return parts.join(", ") || "< 1 min";
};

const cleanCpuModel = (): string => {
	const raw = cpus()[0]?.model ?? "unknown";
	return raw
		.replace(CPU_TRADEMARK_PATTERN, "")
		.replace(CPU_WHITESPACE_PATTERN, " ")
		.trim();
};

const renderColorPalette = (): [string, string] => {
	const block = "███";
	const normalRow = `${Array.from({ length: 8 }, (_, i) => `\u001b[${30 + i}m${block}`).join("")}\u001b[0m`;
	const brightRow = `${Array.from({ length: 8 }, (_, i) => `\u001b[${90 + i}m${block}`).join("")}\u001b[0m`;
	return [normalRow, brightRow];
};

/** Plain system + CLI facts for `--json` output (no ANSI). */
export const collectArtJsonPayload = (version: string) => {
	const username = process.env.USER ?? process.env.USERNAME ?? "user";
	const host = hostname();
	const osLabel = PLATFORM_LABELS[process.platform] ?? process.platform;
	const kernelName = KERNEL_NAMES[process.platform] ?? process.platform;
	const shellPath = process.env.SHELL ?? process.env.ComSpec;
	const usedMem = totalmem() - freemem();

	return {
		arch: process.arch,
		cliName: PACKAGE_NAME,
		cliVersion: version,
		cpuCores: cpus().length,
		cpuModel: cleanCpuModel(),
		hostname: host,
		kernel: `${kernelName} ${release()}`,
		locale: process.env.LANG ?? process.env.LC_ALL ?? "unknown",
		memoryTotalGiB: Number((totalmem() / 1024 ** 3).toFixed(1)),
		memoryUsedGiB: Number((usedMem / 1024 ** 3).toFixed(1)),
		os: osLabel,
		package: PACKAGE_NAME,
		runtime: `Node ${process.version}`,
		shell: shellPath ?? "unknown",
		terminal: process.env.TERM_PROGRAM ?? "unknown",
		uptimeHuman: formatUptime(uptime()),
		username,
		userAtHost: `${username}@${host}`,
		version,
	};
};

const collectInfoLines = (version: string): string[] => {
	const username = process.env.USER ?? process.env.USERNAME ?? "user";
	const host = hostname();
	const titleText = `${username}@${host}`;
	const title = `${neoYellow(username)}${chalk.reset("@")}${neoGreen(host)}`;
	const separator = "─".repeat(titleText.length);

	const osLabel = PLATFORM_LABELS[process.platform] ?? process.platform;
	const kernelName = KERNEL_NAMES[process.platform] ?? process.platform;
	const shellPath = process.env.SHELL ?? process.env.ComSpec;
	const shell = shellPath ?? "unknown";
	const terminal = process.env.TERM_PROGRAM ?? "unknown";
	const locale = process.env.LANG ?? process.env.LC_ALL ?? "unknown";
	const usedMem = totalmem() - freemem();
	const [paletteNormal, paletteBright] = renderColorPalette();

	return [
		title,
		separator,
		infoRow("OS", `${osLabel} ${process.arch}`),
		infoRow("Kernel", `${kernelName} ${release()}`),
		infoRow("Uptime", formatUptime(uptime())),
		infoRow("Shell", shell),
		infoRow("Terminal", terminal),
		infoRow("CPU", `${cleanCpuModel()} (${cpus().length})`),
		infoRow("Memory", `${formatGiB(usedMem)} / ${formatGiB(totalmem())}`),
		infoRow("Locale", locale),
		"",
		infoRow("Version", version),
		infoRow("Runtime", `Node ${process.version}`),
		infoRow("Package", PACKAGE_NAME),
		"",
		`${label("Bags Play CLI")} ${muted(`(${version})`)}`,
		`  ${muted("Usage:")} ${cmd("bags play")} ${muted("<command> [...flags] [...args]")}`,
		"",
		paletteNormal,
		paletteBright,
	];
};

/**
 * Renders the neofetch-style display: art on the left, system info on the right.
 */
export const renderArtDisplay = (version: string): string => {
	const infoLines = collectInfoLines(version);

	const lines = LOGO_LINES.map((rawLine, index) => {
		const colorize = index < LOGO_BRIGHT_THRESHOLD ? accent : accentDim;
		const infoIndex = index - INFO_START_ROW;
		const hasInfo = infoIndex >= 0 && infoIndex < infoLines.length;

		if (hasInfo) {
			return `${colorize(rawLine.padEnd(ART_WIDTH))}${ART_INFO_GAP}${infoLines[infoIndex]}`;
		}
		return colorize(rawLine);
	});

	return ["", ...lines, ""].join("\n");
};

/** Registers `bags play art`. */
export const registerArtCommand = (parent: Command): void => {
	const command = parent
		.command("art")
		.description("Display the Bags logo")
		.action(function (this: Command) {
			const opts = this.optsWithGlobals<{ json?: boolean }>();
			if (opts.json) {
				writeJsonSuccess(collectArtJsonPayload(cliVersion));
				return;
			}
			console.log(renderArtDisplay(cliVersion));
		});

	addExamplesAfter(command, [{ command: "bags play art" }]);
};
