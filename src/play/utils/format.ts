import chalk from "chalk";
import { muted } from "./colors.js";

const SECONDS_PER_MINUTE = 60;
const SECONDS_PER_HOUR = 3_600;
const SECONDS_PER_DAY = 86_400;
const MS_PER_SECOND = 1_000;
const LAMPORTS_PER_SOL = 1_000_000_000;

type DeploymentStatus = "active" | "paused" | "pending";
type RunStatus = "cancelled" | "completed" | "failed" | "pending" | "running";
type StatusTone = "danger" | "muted" | "success" | "warning";

const applyStatusTone = (value: string, tone: StatusTone): string => {
	switch (tone) {
		case "danger":
			return chalk.bold(chalk.red(value));
		case "muted":
			return chalk.dim(value);
		case "success":
			return chalk.bold(chalk.green(value));
		case "warning":
			return chalk.yellow(value);
		default:
			return value;
	}
};

const DEPLOYMENT_STATUS_TONES: Record<DeploymentStatus, StatusTone> = {
	active: "success",
	paused: "warning",
	pending: "muted",
};

const RUN_STATUS_TONES: Record<RunStatus, StatusTone> = {
	cancelled: "muted",
	completed: "success",
	failed: "danger",
	pending: "muted",
	running: "warning",
};

export const formatLamportsAsSol = (
	lamports: bigint | number | string,
	fractionDigits = 6,
): string => {
	let amount: bigint;

	if (typeof lamports === "bigint") {
		amount = lamports;
	} else if (typeof lamports === "string") {
		amount = BigInt(lamports);
	} else {
		amount = BigInt(Math.trunc(lamports));
	}

	return `${(Number(amount) / LAMPORTS_PER_SOL).toFixed(fractionDigits)} SOL`;
};

export const truncateAddress = (value: string, chars = 4): string => {
	if (value.length <= chars * 2 + 3) {
		return value;
	}

	return `${value.slice(0, chars + 2)}...${value.slice(-chars)}`;
};

export const humanDuration = (ms: number): string => {
	const totalSeconds = Math.round(ms / MS_PER_SECOND);

	if (totalSeconds < SECONDS_PER_MINUTE) {
		return `${totalSeconds}s`;
	}

	if (totalSeconds < SECONDS_PER_HOUR) {
		const minutes = Math.floor(totalSeconds / SECONDS_PER_MINUTE);
		const seconds = totalSeconds % SECONDS_PER_MINUTE;
		return seconds > 0 ? `${minutes}m ${seconds}s` : `${minutes}m`;
	}

	const hours = Math.floor(totalSeconds / SECONDS_PER_HOUR);
	const minutes = Math.floor(
		(totalSeconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE,
	);
	return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
};

const formatFutureMinutes = (seconds: number): string => {
	const minutes = Math.floor(seconds / SECONDS_PER_MINUTE);
	const remainder = seconds % SECONDS_PER_MINUTE;
	return remainder > 0 ? `in ${minutes}m ${remainder}s` : `in ${minutes}m`;
};

const formatFutureHours = (seconds: number): string => {
	const hours = Math.floor(seconds / SECONDS_PER_HOUR);
	const minutes = Math.floor((seconds % SECONDS_PER_HOUR) / SECONDS_PER_MINUTE);
	return minutes > 0 ? `in ${hours}h ${minutes}m` : `in ${hours}h`;
};

const formatPastHours = (seconds: number): string => {
	const hours = Math.floor(seconds / SECONDS_PER_HOUR);
	return hours === 1 ? "1 hour ago" : `${hours} hours ago`;
};

const formatDays = (seconds: number, isFuture: boolean): string => {
	const days = Math.floor(seconds / SECONDS_PER_DAY);
	if (isFuture) {
		return days === 1 ? "in 1 day" : `in ${days} days`;
	}
	return days === 1 ? "1 day ago" : `${days} days ago`;
};

export const relativeTime = (
	date: Date | string,
	now: Date = new Date(),
): string => {
	const target = typeof date === "string" ? new Date(date) : date;
	const diffMs = target.getTime() - now.getTime();
	const absDiffSeconds = Math.abs(Math.round(diffMs / MS_PER_SECOND));

	if (absDiffSeconds < 10) {
		return "just now";
	}

	const isFuture = diffMs > 0;

	if (absDiffSeconds < SECONDS_PER_MINUTE) {
		return isFuture ? `in ${absDiffSeconds}s` : `${absDiffSeconds}s ago`;
	}

	if (absDiffSeconds < SECONDS_PER_HOUR) {
		return isFuture
			? formatFutureMinutes(absDiffSeconds)
			: `${Math.floor(absDiffSeconds / SECONDS_PER_MINUTE)} min ago`;
	}

	if (absDiffSeconds < SECONDS_PER_DAY) {
		return isFuture
			? formatFutureHours(absDiffSeconds)
			: formatPastHours(absDiffSeconds);
	}

	return formatDays(absDiffSeconds, isFuture);
};

export const deploymentStatusBadge = (value: DeploymentStatus): string => {
	return applyStatusTone(value, DEPLOYMENT_STATUS_TONES[value] ?? "muted");
};

export const runStatusBadge = (value: RunStatus): string => {
	return applyStatusTone(value, RUN_STATUS_TONES[value] ?? "muted");
};

export const formatField = (
	fieldLabel: string,
	value: string,
	padWidth = 15,
): string => {
	return `  ${chalk.bold(fieldLabel).padEnd(padWidth + 8)}${value}`;
};

export const formatShortDate = (value: string | undefined): string => {
	if (!value) {
		return muted("-");
	}

	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? value : date.toISOString().slice(0, 10);
};

export const truncateValue = (value: string, maxWidth = 40): string => {
	if (value.length <= maxWidth) {
		return value;
	}

	return `${value.slice(0, maxWidth - 3)}...`;
};
