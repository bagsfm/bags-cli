import path from "node:path";
import { describeApp, deserializeApp } from "@bagsfm/play-sdk/app-utils";
import type { AppDefinition } from "@bagsfm/play-shared";
import type { Command } from "commander";
import { assertPlayApiAccess } from "../api/auth.js";
import {
	type ApiClientConfig,
	callApi,
	createPlayClient,
	type PlayApiClient,
	resolveApiClientConfig,
} from "../api/client.js";
import { readProjectConfig } from "../config/project.js";
import { executeEntryFileWithBun } from "../utils/bun-runtime.js";
import {
	appRef,
	bullet,
	label,
	muted,
	sectionHeader,
	status,
	url,
} from "../utils/colors.js";
import { addExamplesAfter } from "../utils/help.js";
import { writeJsonSuccess } from "../utils/json-envelope.js";
import { showError } from "../utils/output.js";

interface InfoCommandOptions {
	bagsApi?: string;
	json?: boolean;
	playApi?: string;
	quiet?: boolean;
	versions?: boolean;
}

interface InfoLogger {
	info(message: string): void;
}

interface StoreAppVersion {
	publishedAt: string;
	snapshot: AppDefinition & { manifest: { visibility: string } };
	verified: boolean;
	version: number;
}

interface StoreAppRecord {
	appId: string;
	currentVersion: number;
	description?: string;
	edges: AppDefinition["edges"];
	interface: AppDefinition["interface"];
	manifest: AppDefinition["manifest"];
	name: string;
	nodes: AppDefinition["nodes"];
	trigger: AppDefinition["trigger"];
	version: string;
}

export type ExecuteEntryFile = (
	entryPath: string,
	runtime: string,
) => Promise<AppDefinition>;

interface ExecuteInfoDependencies {
	createPlayClient?: (config: ApiClientConfig) => PlayApiClient;
	cwd?: string;
	describeApp?: typeof describeApp;
	env?: Record<string, string | undefined>;
	executeEntryFile?: ExecuteEntryFile;
	logger?: InfoLogger;
	readProjectConfig?: typeof readProjectConfig;
	resolveApiClientConfig?: typeof resolveApiClientConfig;
	showError?: typeof showError;
	writeJsonSuccess?: typeof writeJsonSuccess;
}

const defaultLogger: InfoLogger = {
	info(message) {
		console.log(message);
	},
};

const formatDate = (value: string | undefined): string => {
	if (!value) {
		return "unknown";
	}

	const date = new Date(value);
	return Number.isNaN(date.valueOf()) ? value : date.toISOString().slice(0, 10);
};

const formatTrigger = (definition: AppDefinition): string => {
	return definition.trigger.type === "cron" &&
		typeof definition.trigger.schedule === "string"
		? `cron - "${definition.trigger.schedule}"`
		: definition.trigger.type;
};

const buildRegistryUrl = (appId: string, playApiUrl: string): string => {
	const registryUrl = new URL(playApiUrl);
	if (registryUrl.hostname.startsWith("api.")) {
		registryUrl.hostname = registryUrl.hostname.slice(4);
	}

	registryUrl.pathname = `/apps/${appId}`;
	registryUrl.search = "";
	registryUrl.hash = "";
	return registryUrl.toString();
};

const formatInfoMessage = (
	definition: AppDefinition,
	location: "local" | "registry",
	registryStatus?: string,
	registryUrl?: string,
	publishedAt?: string,
	verified?: boolean,
): string => {
	return [
		`${bullet("◆")} ${appRef(`${definition.id}@${definition.version}`)}  ${muted(`(${location})`)}`,
		"",
		`${label("Name:")} ${definition.name}`,
		`${label("Version:")} ${definition.version}`,
		`${label("Description:")} ${definition.description ?? "-"}`,
		`${label("Trigger:")} ${formatTrigger(definition)}`,
		"",
		sectionHeader("Manifest:"),
		`  Author: ${definition.manifest.author ?? "-"}`,
		`  Visibility: ${definition.manifest.visibility}`,
		`  Category: ${definition.manifest.category ?? "-"}`,
		`  Tags: ${definition.manifest.tags?.join(", ") ?? "-"}`,
		"",
		sectionHeader("Graph:"),
		`  Nodes: ${definition.nodes.length}`,
		`  Edges: ${definition.edges.length}`,
		...(location === "local"
			? ["", `Registry status: ${registryStatus ?? muted("unknown (offline)")}`]
			: [
					"",
					`${label("Published:")} ${formatDate(publishedAt)}`,
					`${label("Verified:")} ${verified === true ? "yes" : "no"}`,
					...(registryUrl
						? [`${label("Registry URL:")} ${url(registryUrl)}`]
						: []),
					...(registryStatus
						? [`${label("Registry status:")} ${registryStatus}`]
						: []),
				]),
	].join("\n");
};

const formatVersionsList = (
	appId: string,
	versions: ReadonlyArray<{
		publishedAt: string;
		snapshot: { version: string; manifest: { visibility: string } };
		verified: boolean;
	}>,
): string => {
	return [
		`${appId} - published versions:`,
		"",
		...(versions.length === 0
			? ["  (none)"]
			: versions.map((version) => {
					const visibility =
						version.snapshot.manifest.visibility === "private"
							? muted("private")
							: version.verified
								? status("public, verified", "success")
								: status("public, pending verification", "warning");

					return `  ${version.snapshot.version.padEnd(8)} ${formatDate(version.publishedAt).padEnd(12)} ${visibility}`;
				})),
	].join("\n");
};

const executeEntryFile: ExecuteEntryFile = async (entryPath, runtime) => {
	if (runtime !== "bun") {
		throw new Error(
			'Only runtime = "bun" is currently supported. Install Bun and update your bags.toml.',
		);
	}

	const output = await executeEntryFileWithBun(entryPath, "bags play info");
	if (output.length === 0 || output === "undefined") {
		throw new Error("Entry file did not export an AppDefinition.");
	}

	return deserializeApp(output);
};

const parseAppReference = (
	value: string | undefined,
): { appId?: string; version?: string } => {
	if (!value) {
		return {};
	}

	const atIndex = value.lastIndexOf("@");
	if (atIndex <= 0 || atIndex === value.length - 1) {
		return { appId: value };
	}

	return {
		appId: value.slice(0, atIndex),
		version: value.slice(atIndex + 1),
	};
};

export const executeInfo = async (
	appReference: string | undefined,
	options: InfoCommandOptions,
	{
		createPlayClient: createPlayClientImpl = createPlayClient,
		cwd = process.cwd(),
		describeApp: describeAppImpl = describeApp,
		env = process.env,
		executeEntryFile: executeEntryFileImpl = executeEntryFile,
		logger = defaultLogger,
		readProjectConfig: readProjectConfigImpl = readProjectConfig,
		resolveApiClientConfig: resolveApiClientConfigImpl = resolveApiClientConfig,
		showError: showErrorImpl = showError,
		writeJsonSuccess: writeJsonSuccessImpl = writeJsonSuccess,
	}: ExecuteInfoDependencies = {},
): Promise<void> => {
	const { appId, version } = parseAppReference(appReference);
	if (options.versions && !appId) {
		showErrorImpl("`--versions` can only be used with an App ID.", {
			suggestion:
				"Run `bags play info <appId> --versions` to inspect published versions.",
		});
		return;
	}

	if (!appId) {
		try {
			const projectConfig = await readProjectConfigImpl(cwd);
			const entryPath = path.resolve(cwd, projectConfig.entry);
			const definition = await executeEntryFileImpl(
				entryPath,
				projectConfig.runtime,
			);

			if (options.json) {
				writeJsonSuccessImpl(definition);
				return;
			}

			describeAppImpl(definition);

			let registryStatus = muted("unknown (offline)");
			try {
				const config = await resolveApiClientConfigImpl(
					{
						apiKey: undefined,
						bagsApiUrl: options.bagsApi,
						playApiUrl: options.playApi,
					},
					env,
					undefined,
				);
				if (config.apiKey) {
					const access = assertPlayApiAccess({ apiKey: config.apiKey });
					const client = createPlayClientImpl({
						...config,
						apiKey: access.apiKey,
					});
					const versions = (await callApi(
						client.api.v1.apps[":appId"].versions.$get,
						{
							param: { appId: definition.id },
						},
					)) as StoreAppVersion[];
					const matchedVersion = versions.find(
						(storeVersion) =>
							storeVersion.snapshot.version === definition.version,
					);
					registryStatus = matchedVersion
						? matchedVersion.snapshot.manifest.visibility === "private"
							? status("Published (private)", "muted")
							: matchedVersion.verified
								? status("Published (public, verified)", "success")
								: status("Published (public, pending verification)", "warning")
						: muted("Not published");
				}
			} catch {
				registryStatus = muted("unknown (offline)");
			}

			if (!options.quiet) {
				logger.info(formatInfoMessage(definition, "local", registryStatus));
			}
			return;
		} catch (error) {
			const message =
				error instanceof Error
					? error.message
					: "Failed to load local App metadata.";
			showErrorImpl(message, {
				suggestion: message.includes("No bags.toml found")
					? "Run `bags play init` to create a project."
					: "Check your entry file and try again.",
			});
			return;
		}
	}

	try {
		const config = await resolveApiClientConfigImpl(
			{
				apiKey: undefined,
				bagsApiUrl: options.bagsApi,
				playApiUrl: options.playApi,
			},
			env,
			undefined,
		);
		const access = assertPlayApiAccess({ apiKey: config.apiKey });
		const client = createPlayClientImpl({
			...config,
			apiKey: access.apiKey,
		});

		if (options.versions) {
			const versions = (await callApi(
				client.api.v1.apps[":appId"].versions.$get,
				{
					param: { appId },
				},
			)) as StoreAppVersion[];
			if (options.json) {
				writeJsonSuccessImpl(versions);
				return;
			}
			if (!options.quiet) {
				logger.info(formatVersionsList(appId, versions));
			}
			return;
		}

		const app = (await callApi(client.api.v1.apps[":appId"].$get, {
			param: { appId },
		})) as StoreAppRecord;
		const versions = (await callApi(
			client.api.v1.apps[":appId"].versions.$get,
			{
				param: { appId },
			},
		)) as StoreAppVersion[];
		const currentVersion =
			versions.find(
				(storeVersion) =>
					storeVersion.snapshot.version === (version ?? app.version),
			) ??
			versions.find(
				(storeVersion) => storeVersion.version === app.currentVersion,
			);
		const selectedApp =
			version && currentVersion
				? currentVersion.snapshot
				: ({
						description: app.description,
						edges: app.edges,
						id: app.appId,
						interface: app.interface,
						manifest: app.manifest,
						name: app.name,
						nodes: app.nodes,
						trigger: app.trigger,
						version: app.version,
					} as AppDefinition);

		if (version && !currentVersion) {
			showErrorImpl(`Published version not found: ${appId}@${version}`, {
				suggestion: `Run \`bags play info ${appId} --versions\` to see published versions.`,
			});
			return;
		}

		if (options.json) {
			writeJsonSuccessImpl(version && currentVersion ? currentVersion : app);
			return;
		}

		if (!options.quiet) {
			logger.info(
				formatInfoMessage(
					selectedApp,
					"registry",
					currentVersion
						? currentVersion.snapshot.manifest.visibility === "private"
							? status("Published (private)", "muted")
							: currentVersion.verified
								? status("Published (public, verified)", "success")
								: status("Published (public, pending verification)", "warning")
						: undefined,
					buildRegistryUrl(appId, config.playApiUrl),
					currentVersion?.publishedAt,
					currentVersion?.verified,
				),
			);
		}
	} catch (error) {
		showErrorImpl(
			error instanceof Error
				? error.message
				: `Failed to load registry metadata for ${appId}.`,
			{
				suggestion:
					error instanceof Error && error.message === "Not authenticated."
						? "Run `bags auth login --auth-mode manual --api-key <bags_prod_…>` to authenticate."
						: `Run \`bags play info ${appId} --versions\` to inspect published versions.`,
			},
		);
	}
};

export const registerInfoCommand = (parent: Command): void => {
	const command = parent
		.command("info")
		.argument("[appId]", "App ID or appId@version")
		.description("Display Play App metadata")
		.option("--versions", "List all published versions")
		.action(async function (this: Command, appId?: string) {
			const globalOptions = this.optsWithGlobals<InfoCommandOptions>();
			const localOptions = this.opts<{ versions?: boolean }>();
			await executeInfo(appId, { ...globalOptions, ...localOptions });
		});

	addExamplesAfter(command, [
		{ command: "bags play info" },
		{ command: "bags play info fee-compounder" },
		{ command: "bags play info fee-compounder@1.0.0" },
		{ command: "bags play info fee-compounder --versions" },
	]);
};
