import type { AppDefinition } from "@bagsfm/play-shared";
import { assertPlayApiAccess } from "../api/auth.js";
import {
	type ApiClientConfig,
	type ApiError,
	assertOk,
	createApiError,
	createPlayClient,
	type PlayApiClient,
	resolveApiClientConfig,
} from "../api/client.js";
import { loadValidatedAppDefinition } from "../utils/build.js";
import { appRef, url } from "../utils/colors.js";
import { getPlayCommandErrorDetails } from "../utils/errors.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { createSpinner, showError, showSuccess } from "../utils/output.js";

export interface PublishCommandOptions {
	bagsApi?: string;
	dryRun?: boolean;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
}

export interface ExecutePublishDependencies {
	readonly buildDefinition?: (
		cwd: string,
		quiet: boolean,
	) => Promise<AppDefinition>;
	readonly createPlayClient?: (config: ApiClientConfig) => PlayApiClient;
	readonly createSpinner?: typeof createSpinner;
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly resolveApiClientConfig?: typeof resolveApiClientConfig;
	readonly showError?: typeof showError;
	readonly showSuccess?: typeof showSuccess;
	readonly writeJsonSuccess?: typeof writeJsonSuccess;
}

const buildDefinition = async (
	cwd: string,
	quiet: boolean,
): Promise<AppDefinition> => {
	return await loadValidatedAppDefinition({
		commandLabel: "bags play publish",
		cwd,
		quiet,
	});
};

const buildRegistryVersionUrl = (
	playApiUrl: string,
	appId: string,
	version: string,
): string => {
	const registryUrl = new URL(playApiUrl);
	if (registryUrl.hostname.startsWith("api.")) {
		registryUrl.hostname = registryUrl.hostname.slice(4);
	}

	registryUrl.pathname = `/apps/${appId}@${version}`;
	registryUrl.search = "";
	registryUrl.hash = "";
	return registryUrl.toString();
};

const getApiErrorSuggestion = (error: unknown): string | undefined => {
	if (
		typeof error === "object" &&
		error !== null &&
		"status" in error &&
		((error as ApiError).status === 401 || (error as ApiError).status === 403)
	) {
		return "Check your Bags API key and try again.";
	}

	return undefined;
};

export const executePublish = async (
	options: PublishCommandOptions,
	{
		buildDefinition: buildDefinitionImpl = buildDefinition,
		createPlayClient: createPlayClientImpl = createPlayClient,
		createSpinner: createSpinnerImpl = createSpinner,
		cwd = process.cwd(),
		env = process.env,
		resolveApiClientConfig: resolveApiClientConfigImpl = resolveApiClientConfig,
		showError: showErrorImpl = showError,
		showSuccess: showSuccessImpl = showSuccess,
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: ExecutePublishDependencies = {},
): Promise<void> => {
	const quiet = options.quiet ?? false;
	const spinner = createSpinnerImpl({ json: options.json, quiet });

	try {
		const apiClientConfig = await resolveApiClientConfigImpl(
			{
				bagsApiUrl: options.bagsApi,
				playApiUrl: options.playApi,
			},
			env,
			cwd,
		);
		const access = assertPlayApiAccess({
			apiKey: apiClientConfig.apiKey,
		});
		const client = createPlayClientImpl({
			...apiClientConfig,
			apiKey: access.apiKey,
		});
		const definition = await buildDefinitionImpl(cwd, quiet);

		spinner.start(
			`Checking version - ${appRef(`${definition.id}@${definition.version}`)}...`,
		);
		const versionCheckResponse = await client.api.v1.apps[":appId"].versions[
			":version"
		].$get({
			param: {
				appId: definition.id,
				version: definition.version,
			},
		});

		if (versionCheckResponse.ok) {
			spinner.fail("Version already exists");
			showErrorImpl(
				`Version ${definition.version} already exists for ${definition.id}. Bump the version in your entry file and re-run.`,
				{
					exitCode: 1,
					json: options.json,
				},
			);
			return;
		}

		if (versionCheckResponse.status !== 404) {
			throw await createApiError(versionCheckResponse);
		}

		spinner.stop(
			`Checking version - ${appRef(`${definition.id}@${definition.version}`)} is new`,
		);

		if (options.dryRun) {
			if (options.json) {
				writeJsonSuccessImpl({
					appId: definition.id,
					dryRun: true,
					version: definition.version,
				});
				return;
			}

			showSuccessImpl(
				`Dry run complete. Would publish ${appRef(`${definition.id}@${definition.version}`)}.`,
				{ quiet },
			);
			return;
		}

		spinner.start(
			`Uploading ${appRef(`${definition.id}@${definition.version}`)}...`,
		);
		const publishResponse = await client.api.v1.apps[":appId"].publish.$post({
			param: { appId: definition.id },
			json: { snapshot: definition },
		});
		await assertOk(publishResponse);
		spinner.stop("Published");

		const registryUrl = buildRegistryVersionUrl(
			apiClientConfig.playApiUrl,
			definition.id,
			definition.version,
		);
		if (options.json) {
			writeJsonSuccessImpl({
				appId: definition.id,
				registryUrl,
				version: definition.version,
			});
			return;
		}

		showSuccessImpl(
			`Published ${appRef(`${definition.id}@${definition.version}`)}: ${url(registryUrl)}`,
			{ quiet },
		);
	} catch (error) {
		const details = getPlayCommandErrorDetails(error);
		showErrorImpl(details.message, {
			exitCode: details.exitCode,
			json: options.json,
			suggestion: details.suggestion ?? getApiErrorSuggestion(error),
		});
	}
};
