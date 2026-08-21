import { CronExpressionParser } from "cron-parser";
import { bullet, label, muted, sectionHeader } from "../../utils/colors.js";
import {
	deploymentStatusBadge,
	formatField,
	formatShortDate,
	humanDuration,
	relativeTime,
	runStatusBadge,
	truncateAddress,
} from "../../utils/format.js";

interface DeploymentData {
	readonly appId: string;
	readonly appVersion: string;
	readonly createdAt: string;
	readonly deployedBy: string;
	readonly id: string;
	readonly status: "active" | "paused" | "pending";
	readonly tokenMint: string;
	readonly trigger: {
		readonly schedule: string;
		readonly timezone?: string;
		readonly type: string;
	};
	readonly updatedAt: string;
	readonly walletAddress: string;
	readonly walletId: string;
	readonly alertWebhookUrl?: string;
	readonly config?: {
		readonly env?: Record<string, string>;
		readonly secrets?: readonly string[];
	};
	readonly inputOverrides?: Record<string, unknown>;
	readonly sponsorWallet?: string;
}

interface RunSummary {
	readonly createdAt: string;
	readonly durationMs?: number;
	readonly runId: string;
	readonly status: string;
}

export const computeNextRun = (
	schedule: string,
	timezone?: string,
	now: Date = new Date(),
): Date | null => {
	try {
		const cron = CronExpressionParser.parse(schedule, {
			currentDate: now,
			tz: timezone ?? "UTC",
		});

		return cron.next().toDate();
	} catch {
		return null;
	}
};

export const formatNextRun = (
	deployment: DeploymentData,
	now: Date = new Date(),
): string => {
	if (deployment.status !== "active") {
		return muted("-");
	}

	const nextDate = computeNextRun(
		deployment.trigger.schedule,
		deployment.trigger.timezone,
		now,
	);
	if (!nextDate) {
		return muted("unknown");
	}

	return `${nextDate.toISOString()} (${relativeTime(nextDate, now)})`;
};

export const formatDeploymentRow = (
	deployment: DeploymentData,
	now: Date = new Date(),
): string => {
	const id =
		deployment.id.length > 12
			? `${deployment.id.slice(0, 10)}..`
			: deployment.id;
	const app = `${deployment.appId}@${deployment.appVersion}`;
	const statusText = deploymentStatusBadge(deployment.status);

	let nextRun = muted("-");
	if (deployment.status === "active") {
		const nextDate = computeNextRun(
			deployment.trigger.schedule,
			deployment.trigger.timezone,
			now,
		);
		if (nextDate) {
			nextRun = relativeTime(nextDate, now);
		}
	}

	return `  ${id.padEnd(14)} ${app.padEnd(24)} ${statusText.padEnd(18)} ${deployment.trigger.schedule.padEnd(16)} ${nextRun}`;
};

export const formatDeploymentDetails = (
	deployment: DeploymentData,
	recentRuns: readonly RunSummary[],
	now: Date = new Date(),
): string => {
	const tz = deployment.trigger.timezone ?? "UTC";
	const scheduleDisplay = `${deployment.trigger.schedule} (${tz})`;

	const lines: string[] = [
		`${bullet("◆")} ${label(deployment.id)}`,
		"",
		formatField("App:", `${deployment.appId}@${deployment.appVersion}`),
		formatField("Token:", truncateAddress(deployment.tokenMint)),
		formatField("Wallet:", truncateAddress(deployment.walletAddress)),
		formatField("Status:", deploymentStatusBadge(deployment.status)),
		formatField("Schedule:", scheduleDisplay),
		formatField("Next Run:", formatNextRun(deployment, now)),
		"",
		formatField("Created:", formatShortDate(deployment.createdAt)),
		formatField("Updated:", formatShortDate(deployment.updatedAt)),
		formatField("Deployed by:", deployment.deployedBy),
	];

	if (deployment.sponsorWallet) {
		lines.push(
			formatField("Sponsor:", truncateAddress(deployment.sponsorWallet)),
		);
	}

	if (deployment.alertWebhookUrl) {
		lines.push(formatField("Alert URL:", deployment.alertWebhookUrl));
	}

	if (deployment.config?.secrets && deployment.config.secrets.length > 0) {
		lines.push(formatField("Secrets:", deployment.config.secrets.join(", ")));
	}

	lines.push("");

	if (recentRuns.length === 0) {
		lines.push(sectionHeader("Recent Runs:"));
		lines.push(`  ${muted("(none)")}`);
		return lines.join("\n");
	}

	lines.push(sectionHeader(`Recent Runs (${recentRuns.length}):`));
	for (const run of recentRuns) {
		const duration =
			run.durationMs == null ? muted("-") : humanDuration(run.durationMs);
		const started = relativeTime(run.createdAt, now);
		lines.push(
			`  ${run.runId.padEnd(14)} ${runStatusBadge(run.status as "cancelled" | "completed" | "failed" | "pending" | "running").padEnd(20)} ${String(duration).padEnd(10)} ${started}`,
		);
	}

	return lines.join("\n");
};
