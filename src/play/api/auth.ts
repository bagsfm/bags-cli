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
import { callApi, type PlayApiClient } from "./client.js";

/**
 * Authenticated user payload returned by Play API `/auth/me`.
 */
export interface AuthUser {
	userId: string;
	keyId: string | null;
	keyName: string | null;
}

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
