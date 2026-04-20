import { PlayCommandError } from "./errors.js";

interface JsonMutationConfirmationOptions {
	readonly actionLabel: string;
	readonly commandExample: string;
	readonly force?: boolean;
	readonly json: boolean;
}

export const assertForceForJsonMutation = ({
	actionLabel,
	commandExample,
	force,
	json,
}: JsonMutationConfirmationOptions): void => {
	if (!json || force) {
		return;
	}

	throw new PlayCommandError(
		`JSON mode requires \`--force\` to ${actionLabel}.`,
		{
			suggestion: `Run \`${commandExample}\`.`,
		},
	);
};
