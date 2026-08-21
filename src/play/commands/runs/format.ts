import chalk from "chalk";
import { bullet, label, muted, sectionHeader } from "../../utils/colors.js";
import {
	formatField,
	formatLamportsAsSol,
	formatShortDate,
	humanDuration,
	relativeTime,
	runStatusBadge,
	truncateValue,
} from "../../utils/format.js";

interface RunData {
	readonly appId: string;
	readonly createdAt: string;
	readonly nodesCompleted: number;
	readonly nodesFailed: number;
	readonly nodesSkipped: number;
	readonly outputs: Record<string, unknown>;
	readonly priority: string;
	readonly runId: string;
	readonly status: string;
	readonly appOutputs?: Record<string, unknown>;
	readonly durationMs?: number;
	readonly error?: {
		readonly message: string;
		readonly nodeId?: string;
		readonly type: string;
	};
	readonly finishedAt?: string;
	readonly inputs?: Record<string, unknown>;
	readonly parentRunId?: string;
	readonly startedAt?: string;
}

interface LogEntry {
	readonly message: string;
	readonly timestamp: string;
	readonly type: string;
	readonly data?: unknown;
	readonly durationMs?: number;
	readonly error?: { readonly message: string; readonly type: string };
	readonly nodeId?: string;
	readonly nodeName?: string;
}

type LogDisplayMode = "compact" | "timeline" | "verbose";

export interface RunFeesCliSummary {
	readonly count: number;
	readonly totalLamports: bigint;
	readonly settled: number;
	readonly refunded: number;
	readonly deposited: number;
}

export const summarizeFeeRecords = (
	fees: readonly { amountLamports: string; status: string }[],
): RunFeesCliSummary => {
	let totalLamports = 0n;
	let settled = 0;
	let refunded = 0;
	let deposited = 0;

	for (const fee of fees) {
		totalLamports += BigInt(fee.amountLamports);
		if (fee.status === "settled") {
			settled++;
		} else if (fee.status === "refunded") {
			refunded++;
		} else {
			deposited++;
		}
	}

	return { count: fees.length, deposited, refunded, settled, totalLamports };
};

export const formatRunRow = (run: RunData, now: Date = new Date()): string => {
	const id = run.runId.length > 12 ? `${run.runId.slice(0, 10)}..` : run.runId;
	const statusText = runStatusBadge(
		run.status as "cancelled" | "completed" | "failed" | "pending" | "running",
	);
	const duration =
		run.durationMs == null ? muted("-") : humanDuration(run.durationMs);
	const started = relativeTime(run.createdAt, now);

	return `  ${id.padEnd(14)} ${run.appId.padEnd(16)} ${statusText.padEnd(20)} ${String(duration).padEnd(10)} ${started}`;
};

const pushKeyValueSection = (
	lines: string[],
	title: string,
	record: Record<string, unknown> | undefined,
): void => {
	if (!record || Object.keys(record).length === 0) {
		return;
	}

	lines.push("", sectionHeader(title));
	for (const [key, value] of Object.entries(record)) {
		lines.push(`    ${key.padEnd(18)} ${truncateValue(String(value))}`);
	}
};

export const formatRunDetails = (
	run: RunData,
	now: Date = new Date(),
	feeSummary?: RunFeesCliSummary,
): string => {
	const lines: string[] = [
		`${bullet("◆")} ${label(run.runId)}`,
		"",
		formatField("App:", run.appId),
		formatField(
			"Status:",
			runStatusBadge(
				run.status as
					| "cancelled"
					| "completed"
					| "failed"
					| "pending"
					| "running",
			),
		),
		formatField("Priority:", run.priority),
	];

	if (run.parentRunId) {
		lines.push(formatField("Parent Run:", run.parentRunId));
	}

	lines.push("");
	lines.push(formatField("Created:", formatShortDate(run.createdAt)));

	if (run.startedAt) {
		lines.push(formatField("Started:", run.startedAt));
	}

	if (run.finishedAt) {
		lines.push(formatField("Finished:", run.finishedAt));
	}

	if (run.durationMs != null) {
		lines.push(formatField("Duration:", humanDuration(run.durationMs)));
	}

	lines.push(
		"",
		formatField(
			"Nodes:",
			`${run.nodesCompleted} completed, ${run.nodesFailed} failed, ${run.nodesSkipped} skipped`,
		),
	);

	pushKeyValueSection(lines, "  Inputs:", run.inputs);
	pushKeyValueSection(lines, "  Outputs:", run.appOutputs);

	if (run.error) {
		lines.push(
			"",
			sectionHeader("  Error:"),
			`    ${chalk.red(run.error.type)}: ${run.error.message}`,
		);
		if (run.error.nodeId) {
			lines.push(`    Node: ${run.error.nodeId}`);
		}
	}

	if (feeSummary && feeSummary.count > 0) {
		lines.push(
			"",
			sectionHeader("  Fees:"),
			`    Total: ${formatLamportsAsSol(feeSummary.totalLamports)} across ${feeSummary.count} paid action(s)`,
			`    Settled: ${feeSummary.settled}  Refunded: ${feeSummary.refunded}  Pending: ${feeSummary.deposited}`,
		);
	}

	lines.push("", muted(`  ${relativeTime(run.createdAt, now)}`));

	return lines.join("\n");
};

const LOG_TYPE_COLORS: Record<string, (value: string) => string> = {
	node_complete: (value) => chalk.green(value),
	node_error: (value) => chalk.red(value),
	node_start: (value) => chalk.cyan(value),
	plugin: (value) => chalk.magenta(value),
};

const colorLogType = (type: string): string => {
	const colorFn = LOG_TYPE_COLORS[type];
	return colorFn ? colorFn(type) : type;
};

const formatTimestamp = (iso: string): string => {
	const date = new Date(iso);
	return muted(date.toISOString().slice(11, 19));
};

const formatTimelineEntry = (entry: LogEntry): string => {
	const time = formatTimestamp(entry.timestamp);
	const type = colorLogType(entry.type).padEnd(22);
	const node = entry.nodeName ?? entry.nodeId ?? "";
	const duration =
		entry.durationMs == null
			? ""
			: muted(` (${humanDuration(entry.durationMs)})`);

	return `  ${time}  ${type} ${node.padEnd(18)} ${entry.message}${duration}`;
};

const formatCompactEntry = (entry: LogEntry): string => {
	const time = formatTimestamp(entry.timestamp);
	const type = colorLogType(entry.type.replace("node_", ""));
	const node = entry.nodeName ?? entry.nodeId ?? "";
	return `  ${time} ${type} ${node} ${muted(entry.message)}`;
};

const formatVerboseEntry = (entry: LogEntry): string => {
	const lines: string[] = [
		`  ${formatTimestamp(entry.timestamp)}  ${colorLogType(entry.type)}`,
	];

	if (entry.nodeName || entry.nodeId) {
		lines.push(`    Node: ${entry.nodeName ?? entry.nodeId}`);
	}

	lines.push(`    ${entry.message}`);

	if (entry.durationMs != null) {
		lines.push(`    Duration: ${humanDuration(entry.durationMs)}`);
	}

	if (entry.error) {
		lines.push(
			`    ${chalk.red(`Error [${entry.error.type}]`)}: ${entry.error.message}`,
		);
	}

	if (entry.data != null) {
		lines.push(
			`    Data: ${JSON.stringify(entry.data, null, 2).split("\n").join("\n    ")}`,
		);
	}

	lines.push("");
	return lines.join("\n");
};

export const formatLogEntries = (
	runId: string,
	entries: readonly LogEntry[],
	mode: LogDisplayMode = "timeline",
): string => {
	if (entries.length === 0) {
		return `  ${muted("No logs found.")}`;
	}

	const header = `${sectionHeader("  Run Logs")} ${muted(`(${runId}, ${entries.length} entries)`)}`;

	const formatters: Record<LogDisplayMode, (entry: LogEntry) => string> = {
		compact: formatCompactEntry,
		timeline: formatTimelineEntry,
		verbose: formatVerboseEntry,
	};
	const formatEntry = formatters[mode];

	return [header, "", ...entries.map(formatEntry)].join("\n");
};
