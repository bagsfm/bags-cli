import type { AppDefinition } from "@bagsfm/play-shared";
import { input } from "@inquirer/prompts";
import { assertPlayApiAccess } from "../api/auth.js";
import {
	type ApiClientConfig,
	assertOk,
	createPlayClient,
	type PlayApiClient,
	resolveApiClientConfig,
} from "../api/client.js";
import { loadValidatedAppDefinition } from "../utils/build.js";
import { appRef } from "../utils/colors.js";
import { getPlayCommandErrorDetails } from "../utils/errors.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { showError, showSuccess, showWarning } from "../utils/output.js";

export interface PatchCommandOptions {
	bagsApi?: string;
	force?: boolean;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
	token?: string;
}

export interface ExecutePatchDependencies {
	readonly buildDefinition?: (
		cwd: string,
		quiet: boolean,
	) => Promise<AppDefinition>;
	readonly createPlayClient?: (config: ApiClientConfig) => PlayApiClient;
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly promptForVersion?: (version: string) => Promise<string>;
	readonly resolveApiClientConfig?: typeof resolveApiClientConfig;
	readonly showError?: typeof showError;
	readonly showSuccess?: typeof showSuccess;
	readonly showWarning?: typeof showWarning;
	readonly writeJsonSuccess?: typeof writeJsonSuccess;
}

const buildDefinition = async (
	cwd: string,
	quiet: boolean,
): Promise<AppDefinition> => {
	return await loadValidatedAppDefinition({
		commandLabel: "bags play patch",
		cwd,
		quiet,
	});
};

const promptForVersion = async (version: string): Promise<string> => {
	return await input({
		default: version,
		message: `Type ${version} to confirm the patch`,
	});
};

export const executePatch = async (
	appId: string,
	version: string,
	options: PatchCommandOptions,
	{
		buildDefinition: buildDefinitionImpl = buildDefinition,
		createPlayClient: createPlayClientImpl = createPlayClient,
		cwd = process.cwd(),
		env = process.env,
		promptForVersion: promptForVersionImpl = promptForVersion,
		resolveApiClientConfig: resolveApiClientConfigImpl = resolveApiClientConfig,
		showError: showErrorImpl = showError,
		showSuccess: showSuccessImpl = showSuccess,
		showWarning: showWarningImpl = showWarning,
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: ExecutePatchDependencies = {},
): Promise<void> => {
	let client: PlayApiClient;

	try {
		const apiClientConfig = await resolveApiClientConfigImpl(
			{
				adminToken: options.token,
				bagsApiUrl: options.bagsApi,
				playApiUrl: options.playApi,
			},
			env,
			cwd,
		);
		const access = assertPlayApiAccess({
			adminToken: apiClientConfig.adminToken,
			apiKey: apiClientConfig.apiKey,
			requireAdmin: true,
		});
		client = createPlayClientImpl({
			...apiClientConfig,
			adminToken: access.adminToken,
			apiKey: access.apiKey,
		});
	} catch (error) {
		const details = getPlayCommandErrorDetails(error);
		showErrorImpl(details.message, {
			exitCode: details.exitCode,
			json: options.json,
			suggestion: details.suggestion,
		});
		return;
	}

	if (options.json && !options.force) {
		showErrorImpl(
			"JSON mode requires `--force` to overwrite the deployed version without confirmation.",
			{
				exitCode: 1,
				json: options.json,
				suggestion: `Run \`bags play patch ${appId} ${version} --force --json\`.`,
			},
		);
		return;
	}

	if (!(options.quiet || options.json)) {
		showWarningImpl(
			`This will permanently overwrite ${appRef(`${appId}@${version}`)}.`,
			{
				quiet: options.quiet,
			},
		);
		showWarningImpl(
			"All existing deployments running this version will be affected.",
			{
				quiet: options.quiet,
			},
		);
	}

	if (!options.force) {
		const confirmation = await promptForVersionImpl(version);
		if (confirmation !== version) {
			showErrorImpl(
				`Patch cancelled. Confirmation must match version \`${version}\` exactly.`,
				{
					exitCode: 1,
					json: options.json,
				},
			);
			return;
		}
	}

	try {
		const definition = await buildDefinitionImpl(cwd, options.quiet ?? false);
		if (definition.id !== appId || definition.version !== version) {
			showErrorImpl(
				`Built AppDefinition must match ${appId}@${version}, found ${definition.id}@${definition.version}.`,
				{
					exitCode: 1,
					json: options.json,
				},
			);
			return;
		}

		const patchResponse = await client.api.v1.admin.apps[":appId"].versions[
			":version"
		].$put({
			param: { appId, version },
			json: { snapshot: definition },
		});
		await assertOk(patchResponse);

		if (options.json) {
			writeJsonSuccessImpl({
				appId,
				patched: true,
				version,
			});
			return;
		}

		showSuccessImpl(
			`Patched ${appRef(`${appId}@${version}`)}. Existing deployments now use the new snapshot.`,
			{
				quiet: options.quiet,
			},
		);
	} catch (error) {
		const details = getPlayCommandErrorDetails(error);
		showErrorImpl(details.message, {
			exitCode: details.exitCode,
			json: options.json,
			suggestion: details.suggestion,
		});
	}
};
