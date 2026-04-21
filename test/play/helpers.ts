import { mock } from "bun:test";
import type { AppDefinition } from "@bagsfm/play-shared";
import {
	createPlayClient,
	type PlayApiClient,
} from "../../src/play/api/client.ts";

type FetchFn = (
	input: string | URL | Request,
	init?: RequestInit,
) => Promise<Response>;

export const extractFetchUrl = (input: string | URL | Request): string => {
	if (typeof input === "string") {
		return input;
	}
	if (input instanceof URL) {
		return input.toString();
	}

	return input.url;
};

export const createMockJsonResponse = (
	body: unknown,
	status = 200,
): Response => {
	return new Response(JSON.stringify(body), {
		headers: { "content-type": "application/json" },
		status,
	});
};

export const createTestPlayClient = (
	playApiUrl = "https://play.example.com",
	bagsApiUrl = "https://bags.example.com",
): { client: PlayApiClient; fetchMock: ReturnType<typeof mock<FetchFn>> } => {
	const fetchMock = mock<FetchFn>(async () => createMockJsonResponse({}));

	const client = createPlayClient({
		bagsApiUrl,
		fetchImpl: fetchMock as unknown as typeof fetch,
		playApiUrl,
	});

	return { client, fetchMock };
};

export const createSpinnerMock = () => {
	return {
		fail: mock(() => undefined),
		isSpinning: false,
		message: mock(() => undefined),
		start: mock(() => undefined),
		stop: mock(() => undefined),
	};
};

export const TEST_APP: AppDefinition = {
	description: "Automatically compounds protocol fees into liquidity.",
	edges: [{ id: "edge-1", source: "node-1", target: "node-2" }],
	id: "fee-compounder",
	interface: {
		inputs: [
			{ name: "tokenMint", required: true, type: "string" },
			{ default: 3, name: "minClaimSol", required: false, type: "number" },
		],
		outputs: [{ name: "processedMints", type: "array" }],
	},
	manifest: {
		author: "your-wallet-address",
		category: "community",
		tags: ["fees", "liquidity"],
		visibility: "public",
	},
	name: "Fee Compounder",
	nodes: [
		{ id: "node-1", type: "action" },
		{ id: "node-2", type: "action" },
	],
	trigger: { schedule: "0 * * * *", type: "cron" },
	version: "1.2.0",
};
