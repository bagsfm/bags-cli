import { expect, test } from "bun:test";
import { computeNextRun } from "../../src/play/commands/deployments/format.ts";
import {
	formatLogEntries,
	summarizeFeeRecords,
} from "../../src/play/commands/runs/format.ts";

test("summarizeFeeRecords aggregates totals and statuses", () => {
	const summary = summarizeFeeRecords([
		{ amountLamports: "100", status: "settled" },
		{ amountLamports: "250", status: "refunded" },
		{ amountLamports: "900", status: "deposited" },
	]);

	expect(summary).toEqual({
		count: 3,
		deposited: 1,
		refunded: 1,
		settled: 1,
		totalLamports: 1250n,
	});
});

test("computeNextRun returns null for invalid cron expressions", () => {
	const next = computeNextRun(
		"not-a-cron",
		"UTC",
		new Date("2026-01-01T00:00:00Z"),
	);

	expect(next).toBeNull();
});

test("formatLogEntries renders a no-logs message", () => {
	const output = formatLogEntries("run_123", [], "timeline");

	expect(output).toContain("No logs found.");
	expect(output).not.toContain("Run Logs");
});
