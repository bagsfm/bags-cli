import { expect, test } from "bun:test";
import { resolveProjectFiles } from "../../../src/play/commands/init/templates.ts";
import type { InitOptions } from "../../../src/play/commands/init/types.ts";

test("resolveProjectFiles returns app scaffold files with placeholders replaced", async () => {
	const files = await resolveProjectFiles({
		appName: "fee-compounder",
		includeTests: true,
		noGit: false,
		noInstall: false,
		packageManager: "bun",
		projectType: "app",
		quiet: false,
		skillsRepo: "bagsfm/play-skills",
		skillsToInstall: [],
	} satisfies InitOptions);

	expect(Array.from(files.keys()).sort()).toEqual([
		".gitignore",
		"app.ts",
		"bags.toml",
		"package.json",
		"test/app.test.ts",
		"tsconfig.json",
		"tsconfig.test.json",
	]);
	expect(files.get("app.ts")).toContain(
		'defineApp("fee-compounder", "Fee Compounder")',
	);
	expect(files.get(".gitignore")).toContain("node_modules/");
	expect(files.get("test/app.test.ts")).not.toContain("{{APP_NAME}}");
});

test("resolveProjectFiles returns plugin scaffold files with placeholders replaced", async () => {
	const files = await resolveProjectFiles({
		appName: "price-alerts",
		includeTests: false,
		noGit: false,
		noInstall: false,
		packageManager: "bun",
		pluginAuthor: "Bags FM",
		pluginCategory: "community",
		pluginDescription: "Price alert plugin",
		pluginName: "Price Alerts",
		projectType: "plugin",
		quiet: false,
		skillsRepo: "bagsfm/play-skills",
		skillsToInstall: [],
	} satisfies InitOptions);

	expect(Array.from(files.keys()).sort()).toEqual([
		".gitignore",
		"package.json",
		"src/actions/example.ts",
		"src/plugin.ts",
		"test/plugin.test.ts",
		"tsconfig.json",
	]);
	expect(files.get("src/plugin.ts")).toContain(
		'definePlugin("price-alerts", "Price Alerts")',
	);
	expect(files.get("test/plugin.test.ts")).toContain("Price Alerts");
	expect(files.get("test/plugin.test.ts")).not.toContain("{{PLUGIN_NAME}}");
});
