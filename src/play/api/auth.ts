/**
 * Play-API auth helpers.
 *
 * - `validateApiKeyFormat` checks the developer-key prefix (`bags_prod_`).
 *   Per locked decision D1, Play commands surface a friendly error when
 *   the stored Bags credentials do not satisfy this prefix.
 * - `validateApiKey` calls `/api/v1/auth/me` to confirm the key is valid
 *   and returns the resolved user identity.
 * - `maskApiKey` is re-exported from bags-cli's existing `utils/format.ts`
 *   so we only have one masking implementation in the binary (the play-cli
 *   variant produced a slightly different visual; bags-cli's behavior wins).
 *
 * @packageDocumentation
 */

import { maskApiKey as bagsMaskApiKey } from "../../utils/format.js";
import { url } from "../utils/colors.js";
import { PlayCommandError } from "../utils/errors.js";
import { callApi, type PlayApiClient } from "./client.js";

/**
 * Authenticated user payload returned by Play API `/auth/me`.
 */
export interface AuthUser {
	userId: string;
	keyId: string | null;
	keyName: string | null;
}

interface AssertPlayApiAccessOptions {
	readonly adminToken?: string;
	readonly apiKey?: string | null;
	readonly requireAdmin?: boolean;
}

interface PlayAccessState {
	readonly adminToken?: string;
	readonly apiKey: string;
}

const NOT_AUTHENTICATED_MESSAGE = "Not authenticated.";
const NOT_AUTHENTICATED_HINT =
	"Run `bags auth login --auth-mode manual --api-key <bags_prod_…>` to authenticate.";

const INVALID_FORMAT_MESSAGE =
	"Your current Bags API key isn't compatible with Play.";
const INVALID_FORMAT_HINT = `Run \`bags auth login --auth-mode manual --api-key <bags_prod_…>\` with a Play-compatible key. Get one at ${url("https://dev.bags.fm")}`;

const MISSING_ADMIN_TOKEN_MESSAGE = "This command requires admin access.";
const MISSING_ADMIN_TOKEN_HINT =
	"Set BAGS_PLAY_ADMIN_TOKEN or pass `--token <token>`.";

/**
 * Returns true when the provided key has the `bags_prod_` developer-key prefix.
 * This is the cheap pre-flight check that lets us return the D1 friendly
 * error before making a network round-trip.
 */
export const validateApiKeyFormat = (apiKey: string): boolean => {
	return apiKey.startsWith("bags_prod_");
};

/**
 * Mask an API key for display. Re-exports the existing bags-cli helper to
 * avoid drift between `bags auth status` and `bags play whoami` output.
 */
export const maskApiKey = (apiKey: string): string => bagsMaskApiKey(apiKey);

export const assertPlayApiAccess = ({
	adminToken,
	apiKey,
	requireAdmin = false,
}: AssertPlayApiAccessOptions): PlayAccessState => {
	if (!apiKey) {
		throw new PlayCommandError(NOT_AUTHENTICATED_MESSAGE, {
			suggestion: NOT_AUTHENTICATED_HINT,
		});
	}

	if (!validateApiKeyFormat(apiKey)) {
		throw new PlayCommandError(INVALID_FORMAT_MESSAGE, {
			suggestion: INVALID_FORMAT_HINT,
		});
	}

	if (requireAdmin && !adminToken) {
		throw new PlayCommandError(MISSING_ADMIN_TOKEN_MESSAGE, {
			suggestion: MISSING_ADMIN_TOKEN_HINT,
		});
	}

	return {
		adminToken,
		apiKey,
	};
};

/**
 * Validates the API key against the Play API and returns the associated user.
 * Throws if the prefix check fails; throws an `ApiError` for non-2xx responses.
 */
export const validateApiKey = async (
	client: PlayApiClient,
	apiKey: string,
): Promise<AuthUser> => {
	if (!validateApiKeyFormat(apiKey)) {
		throw new Error("Invalid Bags API key format.");
	}

	return (await callApi(client.api.v1.auth.me.$get)) as AuthUser;
};
