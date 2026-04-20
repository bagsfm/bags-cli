import type { Command } from "commander";
import { assertPlayApiAccess } from "../api/auth.js";
import {
	type ApiClientConfigOverrides,
	createPlayClient,
	type PlayApiClient,
	resolveApiClientConfig,
} from "../api/client.js";

interface CommandApiOptions {
	bagsApi?: string;
	playApi?: string;
}

interface PlayClientCommandOverrides extends ApiClientConfigOverrides {
	requireAdmin?: boolean;
}

export const getPlayClientForCommand = async (
	command: Command,
	overrides: PlayClientCommandOverrides = {},
): Promise<PlayApiClient> => {
	const opts = command.optsWithGlobals<CommandApiOptions>();
	const config = await resolveApiClientConfig({
		...overrides,
		bagsApiUrl: overrides.bagsApiUrl ?? opts.bagsApi,
		playApiUrl: overrides.playApiUrl ?? opts.playApi,
	});
	const access = assertPlayApiAccess({
		adminToken: config.adminToken,
		apiKey: config.apiKey,
		requireAdmin: overrides.requireAdmin,
	});

	return createPlayClient({
		...config,
		adminToken: access.adminToken,
		apiKey: access.apiKey,
	});
};
