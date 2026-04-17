import { defineConfig } from "tsup";

export default defineConfig({
	entry: ["src/index.ts"],
	format: ["esm"],
	target: "node18",
	splitting: false,
	sourcemap: true,
	clean: true,
	dts: false,
	banner: {
		js: "#!/usr/bin/env node",
	},
	noExternal: [
		"@bagsfm/play-sdk",
		"@bagsfm/play-shared",
		"@bagsfm/play-engine",
		"effect",
		"zod",
		"hono",
	],
});
