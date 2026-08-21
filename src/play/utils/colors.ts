/**
 * Chalk-based semantic color helpers ported from play-cli's `utils/colors.ts`.
 *
 * Bags Play CLI uses a custom green RGB (#02FF40) for brand colors. Chalk
 * exposes `rgb()` so we wrap it here to keep callers tidy. A dimmer variant
 * is used for secondary brand accents (e.g. `accentDim`).
 *
 * @packageDocumentation
 */

import chalk from "chalk";

const BAGS_GREEN: readonly [number, number, number] = [2, 255, 64];
const BAGS_GREEN_DIM: readonly [number, number, number] = [2, 204, 51];

const bagsGreen = (value: string): string => chalk.rgb(...BAGS_GREEN)(value);
const bagsGreenDim = (value: string): string =>
	chalk.rgb(...BAGS_GREEN_DIM)(value);

/** Bold brand-green text used for inline labels (key names, badges). */
export const label = (value: string): string => chalk.bold(bagsGreen(value));

/** Bold brand-green text used as a section heading above a list of rows. */
export const sectionHeader = (value: string): string =>
	chalk.bold(bagsGreen(value));

/** Bold brand-green text used to highlight identifiers (App IDs, names). */
export const appRef = (value: string): string => chalk.bold(bagsGreen(value));

/** Underlined dim text for filesystem paths. */
export const filePath = (value: string): string =>
	chalk.dim(chalk.underline(value));

/** Brand-green accent for emphasis (auth status, success values). */
export const accent = (value: string): string => bagsGreen(value);

/** Slightly dimmer brand-green used for secondary accents. */
export const accentDim = (value: string): string => bagsGreenDim(value);

/** Brand-green underline for URLs in help/error output. */
export const url = (value: string): string => chalk.underline(bagsGreen(value));

/** Bold brand-green for command names rendered inline (e.g. `bags play login`). */
export const cmd = (value: string): string => chalk.bold(bagsGreen(value));

/** Bold yellow for warning headings. */
export const warn = (value: string): string => chalk.bold(chalk.yellow(value));

/** Bold brand-green for primary highlight text (whoami fields, etc.). */
export const highlight = (value: string): string =>
	chalk.bold(bagsGreen(value));

/** Dim text for tertiary information (timestamps, hints). */
export const muted = (value: string): string => chalk.dim(value);

/** Brand-green bullet character used in list rows (◆, ●, etc.). */
export const bullet = (value: string): string => bagsGreen(value);

/** Semantic status text used in summaries and lifecycle labels. */
export const status = (
	value: string,
	tone: "muted" | "success" | "warning",
): string => {
	if (tone === "success") {
		return chalk.green(value);
	}
	if (tone === "warning") {
		return chalk.yellow(value);
	}

	return muted(value);
};
