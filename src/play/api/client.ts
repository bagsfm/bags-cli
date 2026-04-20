/**
 * HTTP client for the Bags Play API using hono/client RPC.
 *
 * Ported from play-cli's `api/client.ts`. Notable differences:
 * - `Bun.env` swapped for `process.env` (Node-native).
 * - Credentials read via bags-cli's existing `loadCredentials()` instead
 *   of play-cli's `readCredentials()`.
 * - `User-Agent` set to `bags-cli/<version>` (per PLAY_INTEGRATION.md C19).
 * - `bags.toml` project overrides are deferred to Phase 4 — Phase 1 only
 *   ships `whoami`/`art`/`completion`, none of which need project context.
 *
 * @packageDocumentation
 */

import type { ClientResponse } from "hono/client";
import { hc } from "hono/client";
import { loadCredentials } from "../../lib/credentials.js";
import { cliVersion } from "../../version.js";

const DEFAULT_PLAY_API_URL = "https://api.play.bags.fm";
const DEFAULT_BAGS_API_URL = "https://api.bags.fm";

const PLAY_API_URL_ENV_VAR = "BAGS_PLAY_API_URL";
const BAGS_API_URL_ENV_VAR = "BAGS_API_URL";
const BAGS_API_KEY_ENV_VAR = "BAGS_API_KEY";
const PLAY_ADMIN_TOKEN_ENV_VAR = "BAGS_PLAY_ADMIN_TOKEN";

const PLAY_USER_AGENT = `bags-cli/${cliVersion}`;

/**
 * The published `play-shared` API type bundle currently resolves Hono types
 * from a different install location when consumed through the local workspace
 * dependency, which makes TypeScript treat the route tree as incompatible.
 * Keep the runtime client unblocked by using a loose client surface here.
 */
// biome-ignore lint/suspicious/noExplicitAny: Hono route tree typing crosses package boundaries
export type PlayApiClient = any;

/** Environment shape used when resolving CLI auth and URLs. */
export type ApiEnvironment = Record<string, string | undefined>;

/** Configuration used to build a client instance. */
export interface ApiClientConfig {
	adminToken?: string;
	apiKey?: string;
	bagsApiUrl: string;
	fetchImpl?: typeof fetch;
	playApiUrl: string;
}

/** Override inputs resolved from CLI flags before env/default fallbacks. */
export interface ApiClientConfigOverrides {
	adminToken?: string;
	apiKey?: string;
	bagsApiUrl?: string;
	playApiUrl?: string;
}

/** Error thrown for non-2xx Play API responses. */
export class ApiError extends Error {
	body?: unknown;
	status: number;
	/** From `X-Request-Id` when the server included it on the error response. */
	requestId?: string;

	constructor(
		message: string,
		status: number,
		body?: unknown,
		requestId?: string,
	) {
		super(message);
		this.name = "ApiError";
		this.body = body;
		this.status = status;
		this.requestId = requestId;
	}
}

/** Minimal response shape accepted by error helpers. */
interface ResponseLike {
	readonly headers: Headers;
	readonly ok: boolean;
	readonly status: number;
	readonly statusText: string;
	json(): Promise<unknown>;
	text(): Promise<string>;
}

/** Builds an `ApiError` from a non-ok response. */
export const createApiError = async (
	response: ResponseLike,
): Promise<ApiError> => {
	const contentType = response.headers.get("content-type") ?? "";
	const requestId = response.headers.get("x-request-id") ?? undefined;

	if (contentType.includes("application/json")) {
		const responseBody = (await response.json()) as {
			error?: unknown;
			message?: unknown;
		};
		let message: string;

		if (typeof responseBody.message === "string") {
			message = responseBody.message;
		} else if (typeof responseBody.error === "string") {
			message = responseBody.error;
		} else {
			message =
				response.statusText || `Request failed with status ${response.status}`;
		}

		return new ApiError(message, response.status, responseBody, requestId);
	}

	const responseText = await response.text();
	const message =
		responseText ||
		response.statusText ||
		`Request failed with status ${response.status}`;

	return new ApiError(
		message,
		response.status,
		responseText || undefined,
		requestId,
	);
};

/** Throws an `ApiError` when the response is not ok. */
export const assertOk = async (response: ResponseLike): Promise<void> => {
	if (!response.ok) {
		throw await createApiError(response);
	}
};

/**
 * Calls a hono endpoint, asserts success, and returns the parsed JSON body.
 * The local workspace dependency path currently prevents us from preserving
 * the route tree types cleanly across package boundaries, so this helper
 * intentionally returns `any` for now.
 */
// biome-ignore lint/suspicious/noExplicitAny: client route tree is runtime-safe but not locally type-safe
export const callApi = async (
	fn: (...args: any[]) => Promise<ClientResponse<any, any, any>>,
	...args: any[]
): Promise<any> => {
	const res = await fn(...args);
	if (!res.ok) {
		throw await createApiError(res);
	}
	return await res.json();
};

const getOptionalValue = (value: string | undefined): string | undefined => {
	return typeof value === "string" && value.length > 0 ? value : undefined;
};

const buildAuthHeaders = (config: ApiClientConfig): Record<string, string> => {
	const headers: Record<string, string> = {
		"User-Agent": PLAY_USER_AGENT,
	};

	if (config.apiKey) {
		headers["x-api-key"] = config.apiKey;
	}
	if (config.adminToken) {
		headers["x-admin-token"] = config.adminToken;
	}

	return headers;
};

/**
 * Resolves the effective developer API key.
 *
 * Resolution order:
 *   1. `BAGS_API_KEY` env var
 *   2. `credentials.json.apiKey` (loaded via bags-cli's existing
 *      `loadCredentials()`; same file as `bags auth login` writes to).
 *
 * Returns `null` when no key is available.
 */
export const resolveApiKey = async (
	env: ApiEnvironment = process.env,
): Promise<string | null> => {
	const envApiKey = getOptionalValue(env[BAGS_API_KEY_ENV_VAR]);
	if (envApiKey) {
		return envApiKey;
	}

	const credentials = await loadCredentials();
	return credentials?.apiKey ?? null;
};

/**
 * Resolves client URLs and auth from CLI flags, env vars, and stored credentials.
 *
 * Resolution order (highest priority first):
 *   1. CLI flag overrides (`--play-api`, `--bags-api`)
 *   2. Environment variables (`BAGS_PLAY_API_URL`, `BAGS_API_URL`)
 *   3. Built-in defaults
 *
 * Note: per-project `bags.toml` overrides (read via `smol-toml`) are deferred
 * to Phase 4 when the project-aware commands (`init`, `build`, `info`,
 * `publish`) land. Phase 1 commands do not need project context.
 */
export const resolveApiClientConfig = async (
	overrides: ApiClientConfigOverrides = {},
	env: ApiEnvironment = process.env,
): Promise<ApiClientConfig> => {
	const apiKey =
		getOptionalValue(overrides.apiKey) ??
		(await resolveApiKey(env)) ??
		undefined;
	const adminToken =
		getOptionalValue(overrides.adminToken) ??
		getOptionalValue(env[PLAY_ADMIN_TOKEN_ENV_VAR]);

	return {
		adminToken,
		apiKey,
		bagsApiUrl:
			getOptionalValue(overrides.bagsApiUrl) ??
			getOptionalValue(env[BAGS_API_URL_ENV_VAR]) ??
			DEFAULT_BAGS_API_URL,
		playApiUrl:
			getOptionalValue(overrides.playApiUrl) ??
			getOptionalValue(env[PLAY_API_URL_ENV_VAR]) ??
			DEFAULT_PLAY_API_URL,
	};
};

/** Creates a hono/client RPC client for the Play API. */
export const createPlayClient = (config: ApiClientConfig): PlayApiClient => {
	return hc(config.playApiUrl, {
		headers: buildAuthHeaders(config),
		fetch: config.fetchImpl,
	});
};
