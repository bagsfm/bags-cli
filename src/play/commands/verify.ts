import { assertPlayApiAccess } from "../api/auth.js";
import {
	type ApiClientConfig,
	assertOk,
	callApi,
	createPlayClient,
	type PlayApiClient,
	resolveApiClientConfig,
} from "../api/client.js";
import { appRef, status } from "../utils/colors.js";
import { getPlayCommandErrorDetails } from "../utils/errors.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { showError, showSuccess } from "../utils/output.js";

interface AppVersionRecord {
	readonly publishedAt: string;
	readonly version: string;
}

export interface VerifyCommandOptions {
	bagsApi?: string;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
	token?: string;
}

export interface ExecuteVerifyDependencies {
	readonly createPlayClient?: (config: ApiClientConfig) => PlayApiClient;
	readonly cwd?: string;
	readonly env?: Record<string, string | undefined>;
	readonly resolveApiClientConfig?: typeof resolveApiClientConfig;
	readonly showError?: typeof showError;
	readonly showSuccess?: typeof showSuccess;
	readonly writeJsonSuccess?: typeof writeJsonSuccess;
}

const resolveLatestVersion = (
	versions: readonly AppVersionRecord[],
): string | undefined => {
	if (versions.length === 0) {
		return undefined;
	}

	return [...versions].sort((left, right) => {
		return (
			new Date(right.publishedAt).valueOf() -
			new Date(left.publishedAt).valueOf()
		);
	})[0]?.version;
};

export const executeVerify = async (
	appId: string,
	version: string | undefined,
	options: VerifyCommandOptions,
	{
		createPlayClient: createPlayClientImpl = createPlayClient,
		cwd = process.cwd(),
		env = process.env,
		resolveApiClientConfig: resolveApiClientConfigImpl = resolveApiClientConfig,
		showError: showErrorImpl = showError,
		showSuccess: showSuccessImpl = showSuccess,
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: ExecuteVerifyDependencies = {},
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

	try {
		let resolvedVersion = version;
		if (!resolvedVersion) {
			const versions = (await callApi(
				client.api.v1.apps[":appId"].versions.$get,
				{
					param: { appId },
				},
			)) as AppVersionRecord[];
			resolvedVersion = resolveLatestVersion(versions);
			if (!resolvedVersion) {
				showErrorImpl(`No published versions found for ${appId}.`, {
					exitCode: 1,
					json: options.json,
				});
				return;
			}
		}

		const verifyResponse = await client.api.v1.admin.apps[":appId"].versions[
			":version"
		].verify.$post({
			param: { appId, version: resolvedVersion },
		});
		await assertOk(verifyResponse);

		if (options.json) {
			writeJsonSuccessImpl({
				appId,
				verified: true,
				version: resolvedVersion,
			});
			return;
		}

		showSuccessImpl(
			`${appRef(`${appId}@${resolvedVersion}`)} is now ${status("verified", "success")} and publicly available.`,
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
