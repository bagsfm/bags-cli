# PLAY_INTEGRATION.md

> **Status:** Planning / source of truth
> **Audience:** AI coding agents and human engineers who will execute the integration over multiple sessions
> **Owner path:** `/Users/alaa/bags/bags-cli/PLAY_INTEGRATION.md`
> **Companion repos:**
> - Target (this repo): `bags-cli` at `/Users/alaa/bags/bags-cli/` — the new main CLI, published as `@bagsfm/bags-cli` on public npm
> - Source of features to integrate: `play.bags` monorepo at `/Users/alaa/bags/play.bags/`, specifically `packages/cli` (`@bagsfm/play-cli`) and its dependencies `packages/sdk`, `packages/shared`, `packages/engine`

---

## Table of contents

1. [Purpose and scope](#1-purpose-and-scope)
2. [High-level direction](#2-high-level-direction)
3. [Locked decisions](#3-locked-decisions)
4. [Current state — bags-cli](#4-current-state--bags-cli)
5. [Current state — play-cli](#5-current-state--play-cli)
6. [Conflict map](#6-conflict-map)
7. [Target architecture](#7-target-architecture)
8. [Auth model](#8-auth-model)
9. [Config and credentials layout](#9-config-and-credentials-layout)
10. [Phased rollout plan](#10-phased-rollout-plan)
11. [Command migration matrix](#11-command-migration-matrix)
12. [Technical implementation notes](#12-technical-implementation-notes)
13. [Edge cases and their resolutions](#13-edge-cases-and-their-resolutions)
14. [Open questions and assumptions](#14-open-questions-and-assumptions)
15. [File and directory plan for bags-cli](#15-file-and-directory-plan-for-bags-cli)
16. [Success criteria](#16-success-criteria)
17. [References](#17-references)

---

## 1. Purpose and scope

The company has two CLIs:

- **`bags-cli`** — a recently released public CLI for Bags product surface (auth, wallet, trading, token launches, fee claiming, config, pools, Dexscreener, incorporation, settings). Lives at `/Users/alaa/bags/bags-cli/`, published as `@bagsfm/bags-cli` on public npm, binary name `bags`.
- **`play-cli`** — the CLI for Bags Play (the composable Apps/bots automation platform). Lives at `/Users/alaa/bags/play.bags/packages/cli/` as `@bagsfm/play-cli` inside the play monorepo, shipped as standalone binaries and under a restricted npm scope. Also uses binary name `bags` — this is a direct collision.

**Direction (decided):** Going forward, there is exactly one customer-facing Bags CLI — this `bags-cli` — and all Bags Play functionality is integrated into it under a single subcommand namespace: `bags play …`. `play.bags/packages/cli` is demoted to an internal monorepo dev tool and no longer published.

**Scope of this document:**

- Describe the full current feature set of both CLIs so no command is lost in the port.
- Lock in architectural decisions (auth, bundling, config paths, versioning, etc.) so future agents do not re-litigate them.
- Lay out a phased rollout that ships value early and keeps bags-cli production-safe.
- Enumerate every conflict and edge case with a concrete resolution.

**Out of scope:**

- Changes inside `play.bags` packages (`engine`, `sdk`, `shared`, `api`, `daemon`, `web`) beyond publishing the three packages bags-cli consumes. Broader play.bags refactors should remain in that repo.
- Versioning of `@bagsfm/bags-cli` itself (handled separately).
- A full redesign of bags-cli's existing command surface — the existing `bags auth`, `bags wallet`, `bags fees`, `bags trade`, `bags launch`, `bags config`, `bags partner`, `bags pool`, `bags dexscreener`, `bags incorporation`, `bags settings` are left intact.

---

## 2. High-level direction

1. Integration lives entirely under a new top-level subcommand: `bags play …`. Nothing from play-cli is promoted to the bags-cli root.
2. A single credentials file (the existing `~/.config/bags/credentials.json`) stores the one API key used by both the Bags API and the Play API.
3. Play commands are **natively ported** into `bags-cli` as TypeScript code. They depend on the play SDK via public npm (no shell-out to a second binary).
4. The standalone play CLI binary is **no longer published**; `play.bags/packages/cli` remains in the play monorepo as an internal dev/test tool.
5. The port follows a **foundation-first, 5-phase** rollout so we ship value early and keep each phase reviewable.

---

## 3. Locked decisions

Every decision below was agreed with the product owner during discovery. Future agents must not change them without explicit re-confirmation.

| ID | Area | Decision |
|----|------|----------|
| D1 | Auth strategy | **Unified single login.** The existing `credentials.json.apiKey` is used for both Bags API and Play API. If the stored key is not a `bags_prod_` key, Play commands show a friendly error pointing at `bags auth login --auth-mode manual --api-key <bags_prod_…>`. No dedicated `bags play login` / `bags play logout` commands are part of the integrated CLI baseline. |
| D2 | Bundle / distribution | **Native port.** Release builds should consume `@bagsfm/play-sdk`, `@bagsfm/play-shared`, and `@bagsfm/play-engine` as npm runtime deps in `bags-cli/package.json`. Local workspace development may temporarily keep `file:` dependencies until registry access is available in the automation environment. Replace all `Bun.*` APIs in ported code with `node:fs/promises`, `node:child_process`, `node:fs`, etc. |
| D3 | Config path | **`~/.config/bags/` on every platform** (matches the existing bags-cli layout). Play commands read/write from this path. Existing play-cli users get a one-time auto-migration from `env-paths("bags").config`. |
| D4 | Fate of standalone play-cli | **Internal dev tool only.** Stop publishing `@bagsfm/play-cli` (remove from npm or keep it restricted with a deprecation readme). `play.bags/packages/cli` stays in the monorepo as an internal reference / dev tool. |
| D5 | Command namespace | **Strict nesting under `bags play`.** No Play command is promoted to the bags-cli root. |
| D6 | Phased rollout | **Foundation-first, 5 phases** (see [section 10](#10-phased-rollout-plan)). |
| D7 | UX stack | **Normalize Play commands to bags-cli's stack** during the port: `chalk`, `@inquirer/prompts`, `ora`, `cli-table3`. Drop `@clack/prompts` and `picocolors` in favour of bags-cli's existing libraries. Help rendering follows Commander's default styling (bags-cli pattern), not play-cli's custom `applyStyledHelp`. |
| D8 | Publishing play-sdk | Publish `@bagsfm/play-sdk`, `@bagsfm/play-shared`, `@bagsfm/play-engine` to **public npm** (not restricted). Includes a semver commitment, CHANGELOG, and SECURITY policy in the play monorepo. |
| D9 | Bun runtime requirement | **Runtime pre-check** with a friendly install prompt before `bags play build` / `bags play publish`. Detect `bun` via `which`/`where`; if missing, print an actionable message linking to `https://bun.sh/install` and exit with a clear error. Every other Play command runs on Node only. |
| D10 | Existing play-cli user migration | **Auto-migration on first Play command.** On the first `bags play <cmd>` (or `bags login`) invocation, if `~/.config/bags/credentials.json` is absent but `env-paths("bags").config/credentials.json` exists, copy the key over, print a one-line notice, and continue. |
| D11 | Admin commands visibility | **Visible openly** in `bags play --help` with a `[admin]` badge in the description. They still require `BAGS_PLAY_ADMIN_TOKEN` (or `--token`) to actually execute. |
| D12 | Global flags | **Merge at root.** `--json`, `--input-json`, `-q/--quiet`, `--no-color`, `--play-api`, `--bags-api` are all declared on the root `program` and propagate into every subcommand via `optsWithGlobals()`. |
| D13 | `bags play` default behaviour and `art` | `bags play` with no subcommand prints the Play-scoped help (subcommand list + description + examples). `bags play art` is kept as a support/debug subcommand (ported from play-cli). |
| D14 | Template shipping | **Embed templates** as string literals in the tsup bundle at build time. A `tsup` / `scripts/embed-templates.ts` step generates an `embedded-templates.ts` module that inlines each template file. `dist/index.js` is fully self-contained — no runtime filesystem lookup for templates. |
| D15 | Versioning | **Not locked here.** Handled by the owner separately. Future agents: don't pick a scheme without asking. |

---

## 4. Current state — bags-cli

Source: everything under `/Users/alaa/bags/bags-cli/src/`. Version `0.1.5`, bin `bags`, published as `@bagsfm/bags-cli` on public npm.

### 4.1 Stack

- `commander@^14` for command parsing
- `tsup` → Node ESM bundle, target `node18`, shebang `#!/usr/bin/env node`
- `typescript@^5.9` for typechecking (`tsc --noEmit`)
- `chalk`, `ora`, `cli-table3`, `@inquirer/prompts` for UX
- `@bagsfm/bags-sdk@^1.3.7`, `@solana/web3.js`, `bs58`, `tweetnacl` for Bags/Solana logic
- Focused `bun test` coverage for the integrated Play surface under `test/play/`; still no linter/formatter or CI config in the repo

### 4.2 Entry point

```1:48:src/index.ts
import { Command } from "commander";
// ...
const program = new Command();

program
  .name("bags")
  .description("Bags CLI - auth, trading, launches, fees, and config")
  .version(cliVersion)
  .option("--json", "Output machine-readable JSON where supported")
  .option("--input-json <json>", "Pass all options as a JSON object");

registerSetupCommand(program);
registerAuthCommands(program);
registerWalletCommands(program);
// ...
```

- Global flags: `--json`, `--input-json <json>`.
- Error handling: `src/utils/errors.ts#handleCliError` — user abort → exit 0 with "Goodbye.", any other error → red `Error: ...` to stderr, exit 1.
- Action wrapping: `src/lib/command.ts#wrapAction` merges `--input-json` into the options object, then delegates to the real handler.

### 4.3 Command surface

| Top-level | Subcommand | Purpose (one-line) |
|-----------|------------|--------------------|
| `setup` | — | First-run wizard: RPC URL + wallet import + wallet/manual auth |
| `auth` | `login` / `status` / `logout` | Agent wallet-signature auth or manual API key mode |
| `wallet` | `generate` / `import` / `show` / `balance` | Local keypair management |
| `fees` | `list` / `claim` / `claim-all` / `lifetime` / `events` / `stats` | Claimable-fee positions and analytics |
| `trade` | `quote` / `swap` | Get swap quotes and execute swaps |
| `launch` | `create` / `feed` / `creators` | Full token launch workflow (interactive) |
| `config` | `create` / `update` / `transfer-admin` / `admin-list` | Fee share config (on-chain) |
| `partner` | `create` / `stats` / `claim` | Partner config and claim flows |
| `pool` | `list` / `get` | Pool lookup |
| `dexscreener` | `check` / `order` / `pay` | Dexscreener order flows |
| `incorporation` | `pay` / `submit` / `start` / `list` / `details` | Incorporation project flows |
| `settings` | `show` / `set` | CLI defaults (`rpcUrl`, `commitment`, `output`) |

### 4.4 State on disk

All under `~/.config/bags/` (hardcoded in `src/lib/paths.ts`), files at mode `0o600`, dir at `0o700`:

```1:7:src/lib/paths.ts
import { homedir } from "node:os";
import { join } from "node:path";

export const BAGS_CONFIG_DIR = join(homedir(), ".config", "bags");
export const BAGS_KEYPAIR_PATH = join(BAGS_CONFIG_DIR, "keypair.json");
export const BAGS_CREDENTIALS_PATH = join(BAGS_CONFIG_DIR, "credentials.json");
export const BAGS_SETTINGS_PATH = join(BAGS_CONFIG_DIR, "config.json");
```

- `keypair.json` — Solana keypair secret bytes as JSON array
- `credentials.json` — `{ apiKey, keyId?, authMode: "wallet" | "manual", walletAddress, authenticatedAt }` (schema at `src/lib/credentials.ts`)
- `config.json` — `{ rpcUrl, commitment: "processed" | "confirmed" | "finalized", output: "pretty" | "table" | "json" }`

### 4.5 External surfaces

- Agent auth (wallet-signature flow): raw `fetch` to the **hardcoded** `https://public-api-v2.bags.fm/api/v1` — see `src/lib/auth.ts#BAGS_BASE_URL`. Hits `/agent/v2/auth/init` and `/agent/v2/auth/callback`.
- Everything else: `BagsSDK` from `@bagsfm/bags-sdk`, constructed with the stored `apiKey`, a `Connection` using the configured RPC, and the configured commitment — see `src/lib/sdk.ts`.

### 4.6 Known gaps (independent of Play integration)

- No repo-wide lint/format/CI setup yet — future work.
- Hardcoded Bags auth base URL — no env override.
- `settings` config has `output: "pretty" | "table" | "json"` but `printData` does not branch on `"table"` — only `json` vs non-json affects structured output.
- `partner stats` always prompts for the partner string, so the `?? keypair.publicKey` fallback in the code is effectively dead.

These are noted for awareness; they are **not** blockers for Play integration. Fix them as separate follow-ups.

---

## 5. Current state — play-cli

Source: `/Users/alaa/bags/play.bags/packages/cli/src/`. Version `0.0.39`, bin `bags`, package `@bagsfm/play-cli` (restricted npm). The package is also built as a standalone binary via `bun build --compile --bytecode` and shipped as GitHub release artifacts.

### 5.1 Stack

- `commander@^14` (same major as bags-cli — clean merge)
- `@clack/prompts` for prompts/spinners
- `picocolors` for colors (plus a bespoke `utils/colors.ts` for Bags green RGB)
- `smol-toml` for `bags.toml` parsing
- `env-paths` for OS-standard config directory resolution
- `cron-parser` for cron validation in app definitions
- `hono` — uses `hc<ApiAppType>` (client RPC) only
- Workspace deps: `@bagsfm/play-sdk` (pulls `effect`, `zod`, and `@bagsfm/play-engine` + `@bagsfm/play-shared`), `@bagsfm/play-shared`. Dev-dep: `@bagsfm/play-api` (type-only, for `ApiAppType`)
- `bun test` for tests (package has ~good coverage)
- Bun runtime is required — uses `Bun.file`, `Bun.write`, `Bun.spawn` throughout, and spawns `bun run <loader>.ts` to execute user app entry files

### 5.2 Entry point

`src/cli.ts`. Notable:

- `helpCommand(false)` and a custom `helpInformation` override rendering `renderRootHelp()` from `utils/help.ts`.
- Root flags: `-q, --quiet`, `--no-color`, `--json`, `--play-api <url>`, `--bags-api <url>`, `-v, --version`, `-h, --help`.
- "Heavy" commands (`build`, `info`, `publish`, `patch`) are registered inline in `cli.ts` and their handlers use dynamic `import()` so effect-ts and SDK are loaded lazily (fast cold start for light commands).
- Hidden protocol command: `bags __complete -- <words>` dispatches to `commands/completion/completer.ts` for shell completions.
- Forces `NODE_ENV=production` unconditionally to prevent the transitive Pino logger from trying to load `pino-pretty`.
- On exit (unless `--quiet`, `--json`, or the `upgrade` command), calls `checkForUpdate` which queries GitHub releases and prints a "new version available" box.

### 5.3 Command surface (every top-level and every subcommand)

| Command path | Options / arguments | Purpose |
|--------------|---------------------|---------|
| `art` | — | Neofetch-style logo + system info (version, config path, CWD bags.toml detection). `--json` outputs structured data |
| `completion [shell]` | `--install` | Emit bash/zsh/fish completion script to stdout; `--install` writes to `~/.bags/completions/` and appends a source line to the shell rc |
| `login` | `--token <key>` | Validate key against Play API `/auth/me` and write `credentials.json`. In `--json` mode, `--token` is required |
| `logout` | — | Delete credentials file |
| `whoami` | — | Show authenticated user (from Play API `/auth/me`) and masked key |
| `verify <appId> [version]` **(admin)** | `--token <adminToken>` | Mark an app version as verified via admin API |
| `init [directory]` | `--app`, `--plugin`, `--name <name>`, `--no-test`, `--no-skills`, `--skills-repo <repo>`, `--no-git`, `--no-install` | Scaffold a new App or Plugin project from templates; optional git init, dependency install (via `bun install`), skills install (`bunx skills add`). Rejects `--json`. |
| `plugins list` | — | Paginated list of plugins from Play API |
| `plugins info <pluginId>` | — | Plugin detail: actions, fees, integrated secrets |
| `plugins register <packageName>` **(admin)** | — | Register a plugin package via admin endpoint |
| `secrets list` | `--plugin <id>` | List user secrets (optionally scoped to a plugin) |
| `secrets create <name>` | `--plugin <id>`, `--value <v>` | Create a secret |
| `secrets update <secretId>` | `--name <n>`, `--value <v>` | Update a secret |
| `secrets delete <secretId>` | `--force` | Delete a secret (JSON mode requires `--force`) |
| `deployments list` | `--app <id>`, `--status <s>`, `--token-mint <mint>`, `--limit <n>` | List deployments |
| `deployments get <deploymentId>` | `--runs <n>` | Deployment detail + best-effort recent runs |
| `deployments pause <deploymentId>` **(admin)** | `--reason <reason>` | Pause a deployment (JSON mode requires `--reason`) |
| `deployments unpause <deploymentId>` **(admin)** | `--force` | Unpause (JSON mode requires `--force`) |
| `runs list` | `--app <id>`, `--status <s>`, `--limit <n>` | List runs |
| `runs get <runId>` | — | Run detail + parallel fees fetch (merged in JSON) |
| `runs fees <runId>` | — | Fee attribution for a run |
| `runs logs <runId>` | `--type <t>`, `--node <nodeId>`, `--compact`, `--verbose` | Three display modes: timeline (default), compact, verbose |
| `runs cancel <runId>` | `--force` | Cancel a run (JSON mode requires `--force`) |
| `runs trigger <appId>` | `--input key=value` (repeatable) | Trigger an App run with inputs |
| `upgrade` | `--target <version>` | Pipe `curl https://play.bags.fm/install.sh \| bash` (reinstalls the standalone binary) |
| `build` **(heavy)** | `-o, --output <dir>` (default `release`) | Load `bags.toml`, execute entry via `bun run`, validate the `AppDefinition` via `@bagsfm/play-sdk/app-utils`, write `{sanitized_id}_{version}.json` |
| `info [appId]` **(heavy)** | `--versions` | With no arg: local project info from `bags.toml` + registry status if logged in. With `appId`: latest published. `appId@version` for a specific version. `--versions` lists all versions |
| `publish` **(heavy)** | `--dry-run` | Build + upload to App Store via Play API. Checks version collision first |
| `patch <appId> <version>` **(admin, heavy)** | `--force`, `--token <adminToken>` | Admin-overwrite a deployed version (dangerous; requires confirmation unless `--force`) |

### 5.4 State on disk

- **Config dir:** `env-paths("bags").config` (different per OS!)
  - macOS: `~/Library/Preferences/bags-nodejs/`
  - Linux: `~/.config/bags-nodejs/`
  - Windows: `%APPDATA%/bags-nodejs/Config/`
- **Credentials:** `credentials.json` (just `{ apiKey }`, must start with `bags_prod_`), mode `0o600`, dir `0o700`
- **Project config (per-project):** `bags.toml` in CWD — `entry`, `runtime` (`bun` | `node` — loader only implements `bun`), `package_manager` (`bun` | `pnpm` | `npm` — scaffold install only uses `bun`), optional `play_api`, `bags_api` overrides
- **Update cache:** `env-paths("bags").cache/update-check.json` (24h TTL)
- **Completions:** `~/.bags/completions/`

### 5.5 API resolution order

From `src/api/client.ts#resolveApiClientConfig`, highest priority first:

1. CLI flag overrides (`--play-api`, `--bags-api`, `--token` where relevant)
2. Environment variables (`BAGS_PLAY_API_URL`, `BAGS_API_URL`, `BAGS_API_KEY`, `BAGS_PLAY_ADMIN_TOKEN`)
3. `bags.toml` fields (`play_api`, `bags_api`)
4. Defaults: `https://api.play.bags.fm`, `https://api.bags.fm`

Auth headers: `x-api-key: <apiKey>`, `x-admin-token: <adminToken>` (when present), `User-Agent: bags-play-cli/<version>`.

### 5.6 Templates

Located at `packages/cli/templates/` with two layers:

- **App templates:** `app/base/{app.ts.tmpl, bags.toml, gitignore, package.json, tsconfig.json}`, `app/with-tests/{test/app.test.ts.tmpl, tsconfig.test.json}`
- **Plugin templates:** `plugin/base/{src/plugin.ts.tmpl, src/actions/example.ts.tmpl, test/plugin.test.ts.tmpl, package.json, tsconfig.json, gitignore}`

Placeholders like `{{APP_NAME}}` are replaced at scaffold time. For the compiled bun binary, templates are inlined via `import foo from "./templates/x" with { type: "file" }` in `commands/init/embedded-templates.ts`.

---

## 6. Conflict map

A compact enumeration of everything that conflicts or needs reconciliation.

| # | Area | `bags-cli` today | `play-cli` today | Resolution (per locked decisions) |
|---|------|------------------|------------------|-----------------------------------|
| C1 | Binary name | `bags` → `dist/index.js` | `bags` → `./src/cli.ts` (or compiled `bags`) | Only bags-cli ships a public `bags` binary (D4). play-cli keeps its `bin` locally for monorepo dev only |
| C2 | Runtime | Node 18+ | Bun (compile + `Bun.*` APIs + spawns `bun`) | Port to Node; swap `Bun.file/write/spawn` for `node:fs/promises` + `node:child_process`. `bun` is only required for `build`/`publish` at the user's discretion (D2, D9) |
| C3 | Config dir | `~/.config/bags/` (hardcoded) | `env-paths("bags").config` (OS-specific) | Unified to `~/.config/bags/`. Auto-migration on first Play command (D3, D10) |
| C4 | Credentials schema | `{ apiKey, keyId?, authMode, walletAddress, authenticatedAt }` | `{ apiKey }` (must start with `bags_prod_`) | bags-cli's schema is a superset; keep it. Play reads only `apiKey` from it. See [section 8.4](#84-credentials-file-schema-after-integration) |
| C5 | Auth endpoints | `public-api-v2.bags.fm/api/v1/agent/v2/auth/*` + `sdk.auth.me()` | `api.play.bags.fm/auth/me` via hono client | Same key, two validation paths. Play commands validate on-demand via Play API. `bags auth status` does not need to validate against Play (D1) |
| C6 | API key format | No prefix check | Must start with `bags_prod_` | Play commands enforce `bags_prod_` on use; show the D1 error message if invalid |
| C7 | CLI framework | `commander@^14` | `commander@^14` | No conflict. Same major version — just reuse |
| C8 | Global flags | `--json`, `--input-json` | `-q/--quiet`, `--no-color`, `--json`, `--play-api`, `--bags-api` | Merge all at root (D12). `--input-json` remains unique to bags-cli |
| C9 | UX libraries | `chalk`, `ora`, `cli-table3`, `@inquirer/prompts` | `picocolors`, `@clack/prompts`, custom `applyStyledHelp` | Normalize everything to bags-cli's stack (D7). Remove `@clack/prompts` / `picocolors` from the ported code |
| C10 | `init` templates | n/a | Files on disk + `embedded-templates.ts` for bun compile | Embed templates as string literals in tsup bundle via a codegen step (D14) |
| C11 | App loader | n/a | `Bun.spawn(["bun", "run", loader])` | Replace with `child_process.spawn("bun", ["run", loader])`; pre-check `bun` on PATH (D9) |
| C12 | SDK distribution | n/a (bags-cli has no play deps) | Workspace `@bagsfm/play-sdk@workspace:*` with `publishConfig: restricted` | Publish SDK + shared + engine to public npm (D2, D8). Update bags-cli to depend on published versions |
| C13 | Error exit codes | Generic: 0 (abort) / 1 (error) | Split: `USER_ERROR_EXIT_CODE=1`, `RUNTIME_ERROR_EXIT_CODE=2` | Keep bags-cli's simpler 0/1 scheme for now. If the split matters for a Play command (it rarely does), use `process.exitCode = 2` locally without introducing a constant. Revisit if enough commands need it |
| C14 | Completion / `__complete` | Not present | Implemented with a hidden `bags __complete -- <words>` hook | Port as-is in Phase 1. The hook must live at the bags-cli root (`src/index.ts`), not under `bags play` (shell completion needs the outer binary name) |
| C15 | Update-check banner | Not present | Checks GitHub releases on exit; prints Turbo-style box | **Drop** the update-check in the integrated CLI. `@bagsfm/bags-cli` ships via npm only; `npm outdated -g @bagsfm/bags-cli` covers the need. Eliminates a network hop on every invocation |
| C16 | `upgrade` command | Not present | `bags upgrade` → `curl https://play.bags.fm/install.sh \| bash` | **Drop** `bags play upgrade` entirely. bags-cli is npm-only; users run `npm i -g @bagsfm/bags-cli@latest` |
| C17 | Pino / NODE_ENV | n/a | Forces `NODE_ENV=production` to suppress pino-pretty | Not needed in Node-ported code if we don't transitively import pino. Verify during Phase 5 that the published SDK does not pull pino-pretty into a Node bundle; if it does, apply the same workaround |
| C18 | Admin token | n/a | `BAGS_PLAY_ADMIN_TOKEN` env or `--token` | Port as-is. Admin commands stay opt-in and visible with `[admin]` badge in help (D11) |
| C19 | User-Agent | Not set (SDK default) | `bags-play-cli/<version>` | Port as `bags-cli/<version>` when calling Play API; keep SDK's default for Bags API |
| C20 | Dynamic imports | Not used | Heavy commands `import()` lazily inside `.action()` | Preserve the same pattern in the port for `bags play build/info/publish/patch` so bags-cli startup stays fast for light commands |

---

## 7. Target architecture

### 7.1 One artifact

`@bagsfm/bags-cli` is the only customer-facing CLI. Published to public npm, installed via `npm i -g @bagsfm/bags-cli` or `npx @bagsfm/bags-cli`. Single binary: `bags`.

### 7.2 Namespace

```text
bags
├── setup
├── auth       login / status / logout
├── wallet     generate / import / show / balance
├── fees       list / claim / claim-all / lifetime / events / stats
├── trade      quote / swap
├── launch     create / feed / creators
├── config     create / update / transfer-admin / admin-list
├── partner    create / stats / claim
├── pool       list / get
├── dexscreener check / order / pay
├── incorporation pay / submit / start / list / details
├── settings   show / set
└── play   ← new; everything Play-related lives here
    ├── art
    ├── completion          (installs at root level, not under 'play')
    ├── login
    ├── logout
    ├── whoami
    ├── init
    ├── plugins             list / info / register [admin]
    ├── secrets             list / create / update / delete
    ├── deployments         list / get / pause [admin] / unpause [admin]
    ├── runs                list / get / fees / logs / cancel / trigger
    ├── info
    ├── build               (heavy, requires bun on PATH)
    ├── publish             (heavy, requires bun on PATH)
    ├── patch               [admin, heavy]
    └── verify              [admin]
```

**Exception to strict nesting (per D5 but mechanically necessary):**

- The `__complete` protocol hook used for shell completion must exist at the root (`bags __complete -- …`), not under `bags play`, because the shell's tab-completion is invoked on the outer binary name. The user-facing `completion` command, however, can live at `bags play completion` (it emits scripts for `bags <tab>` including `bags play <tab>`).

### 7.3 Dependency graph

```text
@bagsfm/bags-cli (published to public npm)
├── @bagsfm/bags-sdk       (existing — public npm, 1.3.7+)
├── @bagsfm/play-sdk       (NEW — publish to public npm as part of Phase 0)
├── @bagsfm/play-shared    (NEW — publish to public npm as part of Phase 0)
│   (@bagsfm/play-engine pulled transitively by play-sdk)
├── @solana/web3.js        (existing)
├── chalk                  (existing; used for all commands including Play)
├── @inquirer/prompts      (existing; replaces @clack/prompts)
├── ora                    (existing; replaces @clack/prompts' spinner)
├── cli-table3             (existing)
├── commander              (existing)
├── hono                   (NEW — needed for hc<ApiAppType> client)
├── smol-toml              (NEW — needed for bags.toml parsing during init/build/info/publish)
├── bs58 / tweetnacl       (existing)
└── devDeps: @bagsfm/play-api (type-only for ApiAppType), tsup, typescript
```

The three `env-paths` / `@clack/prompts` / `picocolors` / `cron-parser` deps from play-cli are **not** added. Migration logic uses a tiny inline helper to compute env-paths-like paths for the legacy read-only path (see [section 12.4](#124-path-migration-from-env-paths-to-configbags)).

### 7.4 Runtime requirements

| Command group | Node only | Node + `bun` on PATH |
|---------------|-----------|----------------------|
| All existing bags-cli commands | ✅ | — |
| `bags play` art / completion / login / logout / whoami | ✅ | — |
| `bags play` runs / deployments / plugins / secrets / verify | ✅ | — |
| `bags play info <appId>` (remote lookup) | ✅ | — |
| `bags play info` (no arg, local project) | — | ✅ (needs to execute `entry` file) |
| `bags play init` | ✅ | — (scaffolding is pure Node file writes; post-scaffold `bun install` is optional and auto-skipped with a notice if bun is missing) |
| `bags play build` / `publish` / `patch` | — | ✅ (entry-file execution requires `bun run`) |

Pre-check logic: before any command that requires bun, a `requireBunOnPath()` helper checks `which bun` / `where bun`. If missing, exits with a clear message including the official install URL and a suggestion to re-run.

### 7.5 Build pipeline for bags-cli

Unchanged externally (still tsup → `dist/index.js`), with two additions:

1. A codegen script `scripts/embed-play-templates.ts` runs **before** `tsup` and generates `src/play/templates/embedded.ts` by reading the locally vendored template files from `src/play/templates/source/`.
2. `tsup.config.ts` gains `noExternal` entries for `@bagsfm/play-sdk`, `@bagsfm/play-shared`, `@bagsfm/play-engine`, `effect`, `zod`, `hono`, `smol-toml`, so they are inlined into the single-file bundle (matching bags-cli's existing single-file distribution model). Effect-ts in particular must be bundled to avoid runtime resolution surprises on global installs.

---

## 8. Auth model

### 8.1 Unified single key

There is exactly **one** API key stored on the user's machine, at `~/.config/bags/credentials.json`. This key is expected to be a Bags developer key obtained from `https://dev.bags.fm`, and it works against both:

- **Bags API** (`public-api-v2.bags.fm`, `api.bags.fm`) — used by existing bags-cli commands via `BagsSDK`.
- **Play API** (`api.play.bags.fm`) — used by new `bags play` commands via `hc<ApiAppType>(playApiUrl)`.

### 8.2 Login paths

The user can arrive at a valid key one of three ways. All of them populate the same `credentials.json`:

1. `bags auth login` (wallet mode, existing) — signature flow at `public-api-v2.bags.fm/agent/v2/auth/*` that **returns an `apiKey`**. If this key is a `bags_prod_` key, it also works for Play. If it is not, see 8.5.
2. `bags auth login --auth-mode manual --api-key <bags_prod_…>` (existing) — validates via `sdk.auth.me()` against Bags API and stores. Play commands will accept it if it's `bags_prod_`-prefixed.
3. No dedicated `bags play login`. Play reuses the existing `bags auth login` / `bags auth login --auth-mode manual --api-key <bags_prod_…>` flows and reads the same `credentials.json.apiKey`.

### 8.3 Resolution order for Play commands

Inside the ported Play API client (`src/play/api/client.ts` in the integrated repo):

1. `BAGS_API_KEY` env var if set
2. `credentials.json.apiKey` via `loadCredentials()`
3. No key → friendly error pointing at `bags auth login`

All Play API commands then run through a shared preflight before making API calls:

4. Non-`bags_prod_` key → the D1 friendly incompatible-key error from 8.5
5. Admin commands resolve `x-admin-token` in this order:
   - `--token <token>` when the command exposes it
   - `BAGS_PLAY_ADMIN_TOKEN`
   - no token → targeted upfront admin-access error (no API call)

### 8.4 Credentials file schema after integration

Unchanged from bags-cli's current schema. Play adds no new fields. Example:

```json
{
  "apiKey": "bags_prod_abc…",
  "keyId": "key_abc",
  "authMode": "wallet",
  "walletAddress": "EB1…Pump",
  "authenticatedAt": "2026-04-16T12:34:56.000Z"
}
```

- `apiKey` — required; consumed by both Bags SDK and Play API client.
- `keyId`, `authMode`, `walletAddress`, `authenticatedAt` — existing fields, untouched by Play commands.
- If `authMode === "wallet"` and the `apiKey` is not `bags_prod_`-prefixed, Play commands error out per D1.

### 8.5 Error message for incompatible keys

Exactly one friendly message, used everywhere a Play command detects a non-`bags_prod_` key:

```text
Your current Bags API key isn't compatible with Play.

Run one of:
  bags auth login --auth-mode manual --api-key <bags_prod_…>

Get a Play-compatible key at https://dev.bags.fm
```

Printed via `showError` (bags-cli chalk-red style) with a suggestion.

### 8.6 `bags play whoami`

Calls Play API `/auth/me` with the current key and prints user ID + key name. In `--json` mode, emits the structured user object. Does not touch Bags API.

### 8.7 No dedicated `bags play logout`

Play reuses the existing `bags auth logout` command. No phase introduces a separate `bags play logout`.

---

## 9. Config and credentials layout

### 9.1 Files in `~/.config/bags/` after integration

| File | Owner | Written by | Read by | Notes |
|------|-------|-----------|---------|-------|
| `credentials.json` | shared | `bags auth login`, migration | everything | Schema in 8.4 |
| `keypair.json` | bags | `bags wallet generate/import`, `bags setup`, `bags auth login --auth-mode wallet` | bags wallet/trade/launch/etc. | Solana keypair bytes |
| `config.json` | bags | `bags settings set`, `bags setup` | everything that needs RPC/commitment/output | bags-cli settings |
| (no Play project settings here) | — | — | — | Project settings live in the project's `bags.toml`, not in `~/.config` |

### 9.2 Project `bags.toml` (Play apps only)

Per-project file read by `bags play build/info/publish/init`. Schema unchanged from play-cli:

```toml
entry = "./app.ts"
runtime = "bun"        # only "bun" is currently supported for entry execution
package_manager = "bun" # only "bun" used for `bags play init` installs
# optional:
play_api = "https://api.play.bags.fm"
bags_api = "https://api.bags.fm"
```

### 9.3 Env variables honoured after integration

| Env var | Used by | Effect |
|---------|---------|--------|
| `BAGS_API_KEY` | everything | Overrides the stored `credentials.json.apiKey` |
| `BAGS_PLAY_API_URL` | Play commands | Overrides Play API base URL |
| `BAGS_API_URL` | Play commands (for `--bags-api`) | Overrides Bags API base URL (note: distinct from the hardcoded `public-api-v2.bags.fm` bags-cli uses for agent auth) |
| `BAGS_PLAY_ADMIN_TOKEN` | Play admin commands | Sent as `x-admin-token` header |
| `NO_COLOR` | everything | Disables ANSI colors (bags-cli adds this during port) |
| `DEBUG` | n/a today | Not added as part of this integration |

### 9.4 Migration from legacy play-cli paths

Triggered lazily on first Play command or `bags login`. Implementation sketch:

```ts
async function migrateLegacyPlayCredentials(): Promise<void> {
  if (await fileExists(BAGS_CREDENTIALS_PATH)) return;
  const legacyDir = computeLegacyEnvPathsConfigDir(); // OS-switch
  const legacyCreds = join(legacyDir, "credentials.json");
  if (!(await fileExists(legacyCreds))) return;
  const parsed = JSON.parse(await readFile(legacyCreds, "utf8"));
  if (typeof parsed?.apiKey !== "string") return;
  await writeJsonSecure(BAGS_CREDENTIALS_PATH, {
    apiKey: parsed.apiKey,
    authMode: "manual",
    walletAddress: "",
    authenticatedAt: new Date().toISOString(),
  });
  console.log(chalk.dim(`Migrated Play CLI credentials to ${BAGS_CREDENTIALS_PATH}.`));
}
```

`computeLegacyEnvPathsConfigDir()` replicates `env-paths("bags", { suffix: "" })` without adding the dep:

- macOS: `~/Library/Preferences/bags-nodejs/`
- Linux: `$XDG_CONFIG_HOME/bags-nodejs/` or `~/.config/bags-nodejs/`
- Windows: `%APPDATA%/bags-nodejs/Config/`

Writes only to the new canonical path. Never deletes the legacy file — leaves it alone for forensics.

---

## 10. Phased rollout plan

Foundation-first. Each phase is reviewable independently, shippable as a separate release, and leaves the CLI in a working state.

### Phase 0 — Preparation (no bags-cli changes yet)

**Deliverables:**

1. In `play.bags` monorepo: flip `publishConfig.access` on `@bagsfm/play-sdk`, `@bagsfm/play-shared`, `@bagsfm/play-engine` to `public`. Commit a CHANGELOG and a SECURITY/stability note in each package's `docs/`.
2. Publish these three packages to public npm, tagged at their current `0.0.39` (or bump to `0.1.0` if team wants a clean public release).
3. Decide the ongoing release cadence for play-sdk (likely tied to play.bags monorepo release tags).
4. In `play.bags`: change `publishConfig` of `@bagsfm/play-cli` to `private: true` (or remove `publishConfig` entirely) so it cannot be published accidentally. Update the play monorepo README to note the CLI is internal-only going forward.
5. Add a README section to play.bags/packages/cli explicitly marking it "internal dev tool — see bags-cli for the customer CLI".

**Exit criteria:** `npm view @bagsfm/play-sdk` returns a published version with `"access": "public"`; installing it in a fresh Node project works.

**Est. scope:** small (mostly config + publish flows).

### Phase 1 — Foundation and identity

**Deliverables:**

1. Create a new `src/play/` directory in bags-cli with the sub-structure from [section 15](#15-file-and-directory-plan-for-bags-cli).
2. Register a `registerPlayCommands(program)` factory called from `src/index.ts` that creates the `bags play` parent command with its own description and help examples.
3. Merge play-cli's root global flags into `bags-cli` root: `-q/--quiet`, `--no-color`, `--play-api`, `--bags-api`. Update `wrapAction` in `src/lib/command.ts` to be `--no-color` / `--quiet`-aware; update `printData` and `log` to no-op under `--quiet`.
4. Port the tiny client infrastructure:
   - `src/play/api/client.ts` — `createPlayClient`, `resolveApiClientConfig`, `callApi`, `ApiError`, `assertOk`, `createApiError`. Node-native (no Bun.file/env). Reads credentials via existing `loadCredentials()`.
   - `src/play/api/auth.ts` — `validateApiKey` (calls `/auth/me`), `validateApiKeyFormat` (`bags_prod_` prefix), `maskApiKey` (reuse bags-cli's existing `maskApiKey` from `utils/format.ts` — no duplication).
5. Port light commands:
   - `bags play art` — neofetch-style (simple `chalk`-based output, no picocolors). Reads config paths via bags-cli's `paths.ts`.
   - `bags play whoami` — calls Play API `/auth/me`, prints user + masked key. JSON mode emits the user object.
   - `bags play completion [shell]` — emits bash/zsh/fish completion. `--install` writes to `~/.bags/completions/` and source-lines into the user's shell rc. Completion scripts reference the outer `bags` binary.
   - Root-level hidden hook: `bags __complete -- <words>` dispatches to the completion handler. Lives in `src/index.ts` before `program.parseAsync`.
6. Auto-migration logic in a shared entry shim that runs before any Play subcommand parses (see [section 9.4](#94-migration-from-legacy-play-cli-paths)).

**Exit criteria:**

- `bags --help` shows the new `play` group.
- `bags play --help` lists all Phase 1 subcommands.
- A user with an existing play-cli install can run `bags play whoami` and it works silently (auto-migrated).
- A new user can run `bags auth login --auth-mode manual --api-key bags_prod_…` and then `bags play whoami`.
- Existing bags-cli commands still work identically.

**Est. scope:** medium.

### Phase 2 — Read-only Play API commands

**Deliverables:**

1. `bags play runs list` + `bags play runs get <runId>` + `bags play runs fees <runId>` + `bags play runs logs <runId>` (with `--compact` / `--verbose` / `--type` / `--node`).
2. `bags play deployments list` + `bags play deployments get <deploymentId>` (with `--runs <n>`).
3. `bags play plugins list` + `bags play plugins info <pluginId>`.
4. `bags play secrets list` (with `--plugin`).

**Porting notes:**

- Replace `@clack/prompts` spinner with a thin `ora` wrapper in `src/play/utils/output.ts`.
- Replace `picocolors` (`pc.bold`, `pc.dim`, …) with `chalk.bold`, `chalk.dim`.
- Replace `@clack/prompts.password/confirm/select` with `@inquirer/prompts`' equivalents.
- The log-formatter in `commands/runs/logs.ts` is fairly large (three display modes); port it in full but strip the styled-help layer — use `.description()` + `.addHelpText("after", exampleText)` instead of `applyStyledHelp`.
- Table output uses `cli-table3` (already a bags-cli dep). Keep play's JSON shapes identical for backwards scripting compatibility.
- `bags settings set --output json` must activate Play JSON envelopes even when the user does not pass `--json`.
- Phase 2 commands use the root `--input-json` bridge through a Play-specific action wrapper, so automation stays consistent with the rest of bags-cli.

**Exit criteria:** a user can observe the full state of their apps (runs, deployments, plugins, secrets) via `bags play …` with read-only operations.

**Est. scope:** medium-large — biggest volume of UI code in the project.

### Phase 3 — Write Play API commands

**Deliverables:**

1. `bags play secrets create <name>` / `update <secretId>` / `delete <secretId>` (with `--force`).
2. `bags play runs trigger <appId> --input key=value` (repeatable) / `cancel <runId> --force`.
3. `bags play deployments pause <id> --reason <reason>` **[admin]** / `unpause <id> --force` **[admin]**.
4. `--json` parity with play-cli for every above: destructive actions require `--force` (or `--reason`) in JSON mode.

**Porting notes:**

- Preserve the JSON mode guard pattern: in JSON mode, show an immediate error if the required flag is missing rather than prompting.
- Admin commands get `[admin]` badge in the description and respect `BAGS_PLAY_ADMIN_TOKEN` / `--token`.
- Apply the shared Play auth/admin preflight to the new write commands and backfill it into existing Play API read commands so `bags play` behaves consistently across the full command surface.
- Keep the command map and JSON envelopes compatible with play-cli, but take the approved low-risk fixes during the integrated port:
  - `bags play secrets update --json` may perform rename-only updates without forcing `--value`
  - `bags play runs trigger --input ...` rejects malformed `key=value` pairs instead of silently dropping them

**Exit criteria:** a user can drive the full write surface of their Play account from the integrated CLI.

**Est. scope:** medium.

### Phase 4 — Developer-facing commands

**Deliverables:**

1. `bags play init [directory]` with `--app`, `--plugin`, `--name`, `--no-test`, `--no-skills`, `--skills-repo`, `--no-git`, `--no-install`.
2. `bags play info [appId]` with `--versions`.
3. `bags play plugins register <packageName>` **[admin]**.

**Porting notes:**

- Implement template embedding codegen at `scripts/embed-play-templates.ts`. Generate `src/play/templates/embedded.ts` from the locally vendored template source under `src/play/templates/source/`, and hook it into the `build` / `prepublishOnly` scripts.
- Rewrite `init/index.ts` using `@inquirer/prompts.confirm/input/select`. Replace `prompts.intro` / `prompts.outro` with plain `console.log` + `chalk` styling (matching bags-cli conventions).
- `installSkills` — port but keep behavior identical (invokes `bunx skills add …`). On machines without bun, emit a warning and a manual command the user can run (matches existing UX).
- `installDependencies` — port but auto-skip with a notice if `bun` is not on PATH. Point user at `bun install` themselves. No fallback to `npm install` — the scaffold targets bun.
- `bags play info` with no arg needs to execute the entry file, which requires bun. Apply the `requireBunOnPath()` pre-check in that branch only; the remote-lookup branch (`bags play info <appId>`) runs on Node alone.

**Exit criteria:** developers can scaffold a new Play app, see its metadata, and navigate to Phase 5 by installing bun if not present.

**Est. scope:** medium.

### Phase 5 — Heavy commands (bun required)

**Deliverables:**

1. `bags play build [-o <dir>]`.
2. `bags play publish [--dry-run]`.
3. `bags play patch <appId> <version> [--force] [--token <adminToken>]` **[admin]**.
4. `bags play verify <appId> [version] [--token <adminToken>]` **[admin]**.

**Porting notes:**

- Replace `Bun.spawn(["bun", "run", loader])` with:
  ```ts
  import { spawn } from "node:child_process";
  // ... stream stdout/stderr, await exit code
  ```
  Exact sketch in [section 12.3](#123-bun-runtime-detection-and-spawn-replacement).
- Preserve the lazy `import()` pattern: `build`, `info`, `publish`, `patch` are registered with an `.action()` body that dynamically imports their implementation module. This keeps cold startup fast for users who never call heavy commands.
- `@bagsfm/play-sdk/app-utils` provides `describeApp`, `validateApp`, `serializeApp`, `deserializeApp` — all Node-safe once we publish to npm and verify there are no `Bun.*` references in the compiled `dist/` of those packages.
- `requireBunOnPath()` pre-check before any entry-file execution. Friendly message per D9.
- Admin commands get `[admin]` badge + `BAGS_PLAY_ADMIN_TOKEN` / `--token` support.

**Exit criteria:** full parity with the standalone play-cli. At this point we can fully retire publishing play-cli and call the integration complete.

**Est. scope:** medium — most code is a direct port of existing logic, but validating Node compatibility of the published SDK is the big unknown.

---

## 11. Command migration matrix

Every play-cli command mapped to its `bags-cli` equivalent. Status column tracks implementation state across phases.

| play-cli (today) | bags-cli (after integration) | Phase | Status |
|------------------|------------------------------|-------|--------|
| `bags art` | `bags play art` | 1 | implemented |
| `bags completion` | `bags play completion` (+ root-level `__complete` hook) | 1 | implemented |
| `bags login` | `bags auth login` (shared Bags/Play auth) | 1 | implemented |
| `bags logout` | `bags auth logout` (shared Bags/Play auth) | 1 | implemented |
| `bags whoami` | `bags play whoami` | 1 | implemented |
| `bags runs list` | `bags play runs list` | 2 | implemented |
| `bags runs get` | `bags play runs get` | 2 | implemented |
| `bags runs fees` | `bags play runs fees` | 2 | implemented |
| `bags runs logs` | `bags play runs logs` | 2 | implemented |
| `bags deployments list` | `bags play deployments list` | 2 | implemented |
| `bags deployments get` | `bags play deployments get` | 2 | implemented |
| `bags plugins list` | `bags play plugins list` | 2 | implemented |
| `bags plugins info` | `bags play plugins info` | 2 | implemented |
| `bags secrets list` | `bags play secrets list` | 2 | implemented |
| `bags secrets create` | `bags play secrets create` | 3 | implemented |
| `bags secrets update` | `bags play secrets update` | 3 | implemented |
| `bags secrets delete` | `bags play secrets delete` | 3 | implemented |
| `bags runs trigger` | `bags play runs trigger` | 3 | implemented |
| `bags runs cancel` | `bags play runs cancel` | 3 | implemented |
| `bags deployments pause` | `bags play deployments pause` **[admin]** | 3 | implemented |
| `bags deployments unpause` | `bags play deployments unpause` **[admin]** | 3 | implemented |
| `bags init` | `bags play init` | 4 | implemented |
| `bags info` | `bags play info` | 4 | implemented (remote branch); 5 (local branch, requires bun) |
| `bags plugins register` | `bags play plugins register` **[admin]** | 4 | implemented |
| `bags build` | `bags play build` **[heavy]** | 5 | implemented |
| `bags publish` | `bags play publish` **[heavy]** | 5 | implemented |
| `bags patch` | `bags play patch` **[admin, heavy]** | 5 | implemented |
| `bags verify` | `bags play verify` **[admin]** | 5 | implemented |
| `bags upgrade` | **DROPPED** (use `npm i -g @bagsfm/bags-cli@latest`) | — | dropped (C16) |

---

## 12. Technical implementation notes

### 12.1 Bundle strategy (tsup config)

Current `tsup.config.ts`:

```1:14:tsup.config.ts
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
});
```

Proposed updates during Phase 1 / 5:

```ts
export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: false,
  banner: { js: "#!/usr/bin/env node" },
  noExternal: [
    "@bagsfm/play-sdk",
    "@bagsfm/play-shared",
    "@bagsfm/play-engine",
    "effect",
    "zod",
    "hono",
    "smol-toml",
    // keep @bagsfm/bags-sdk external so it's npm-installed separately (it already is)
  ],
  // Preserve dynamic imports: do not split, but also do not pre-inline
  // heavy command modules — their imports are structural signals for lazy loading.
});
```

Notes:
- `noExternal` inlines the listed packages so users get a self-contained `dist/index.js`. This mirrors bags-cli's current single-file model.
- `@bagsfm/bags-sdk` stays external (it has native Solana bindings and is already an external npm dep).
- Dynamic `import()` inside command `.action()` handlers (for `build`/`info`/`publish`/`patch`) still works with `splitting: false` + bundle because tsup generates a single file where the dynamic import resolves to an already-loaded module. This is an acceptable trade-off: we lose true lazy load benefit in exchange for single-file distribution. If startup time regresses, re-evaluate `splitting: true` with a prelude.

### 12.2 Template embedding strategy

**Source of truth for templates (resolved for Phase 4):** keep a local copy of the current Play CLI templates inside `bags-cli` under `src/play/templates/source/`.

- This intentionally trades long-term deduplication for short-term delivery: `bags-cli` gets a self-contained scaffold source immediately without waiting on a separate published templates package.
- The local copy should stay structurally identical to `play.bags/packages/cli/templates/` until a later cleanup consolidates template ownership.
- The embedding script reads only from this local source tree, so Phase 4 builds do not depend on unpublished template assets from another package.

**Embedding:** `scripts/embed-play-templates.ts` walks the template directory and emits `src/play/templates/embedded.ts`:

```ts
// Auto-generated by scripts/embed-play-templates.ts — do not edit by hand.
export const EMBEDDED_TEMPLATES: ReadonlyMap<string, string> = new Map([
  ["app/base/app.ts.tmpl", "import { defineApp } from …\n…"],
  ["app/base/bags.toml", "entry = \"./app.ts\"\n…"],
  // …
]);
```

At scaffold time, `resolveProjectFiles` reads from this map (not from disk). Path-renames (e.g., `gitignore` → `.gitignore`) happen in-memory.

### 12.3 Bun runtime detection and spawn replacement

A single helper at `src/play/utils/bun-runtime.ts`:

```ts
import { spawn } from "node:child_process";
import { lookpath } from "lookpath"; // or inline impl with `which`/`where`

export async function findBun(): Promise<string | null> {
  return await lookpath("bun");
}

export async function requireBunOnPath(
  commandLabel: string, // e.g. "bags play build"
): Promise<string> {
  const path = await findBun();
  if (path) return path;
  throw new CliError(
    `${commandLabel} requires Bun.`,
    {
      suggestion:
        "Install Bun with `curl -fsSL https://bun.sh/install | bash`, " +
        "then re-run this command. Full docs: https://bun.sh/docs/installation",
    },
  );
}

export async function executeEntryFileWithBun(
  entryPath: string,
): Promise<string> {
  const bunPath = await requireBunOnPath("Building an App");
  // write loader.ts into a temp dir, then:
  return await new Promise((resolve, reject) => {
    const child = spawn(bunPath, ["run", loaderPath], {
      cwd: dirname(entryPath),
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (c) => (stdout += c));
    child.stderr.on("data", (c) => (stderr += c));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code !== 0) reject(new Error(stderr.trim() || "bun run failed"));
      else resolve(stdout.trim());
    });
  });
}
```

Use `lookpath` (tiny, MIT) or a ~10-line inline `which`/`where` implementation. Don't shell out to `sh -c "which bun"` — that breaks on Windows.

### 12.4 Path migration from env-paths to ~/.config/bags

Inline `computeLegacyEnvPathsConfigDir()` to avoid adding `env-paths` as a dep:

```ts
import { homedir, platform } from "node:os";
import { join } from "node:path";

export function computeLegacyPlayConfigDir(): string {
  const home = homedir();
  const plat = platform();
  if (plat === "darwin") {
    return join(home, "Library", "Preferences", "bags-nodejs");
  }
  if (plat === "win32") {
    const appData = process.env.APPDATA ?? join(home, "AppData", "Roaming");
    return join(appData, "bags-nodejs", "Config");
  }
  // linux/bsd/other: XDG_CONFIG_HOME or ~/.config
  const xdg = process.env.XDG_CONFIG_HOME;
  return xdg ? join(xdg, "bags-nodejs") : join(home, ".config", "bags-nodejs");
}
```

Confirm this matches `env-paths("bags", { suffix: "" })` output for the package `bags`. `env-paths` appends a `-nodejs` suffix by default, hence `bags-nodejs`.

### 12.5 UX stack normalization checklist

When porting any play-cli file to `bags-cli/src/play/`:

| Play-cli construct | Replacement |
|---|---|
| `import pc from "picocolors"` + `pc.bold(x)` | `import chalk from "chalk"` + `chalk.bold(x)` |
| `import { spinner } from "@clack/prompts"` | `import ora from "ora"` (wrap it with a thin Play-specific helper in `src/play/utils/output.ts`) |
| `import { password, confirm, select, isCancel } from "@clack/prompts"` | `import { password, confirm, select } from "@inquirer/prompts"` — inquirer throws on cancel rather than returning a symbol, so error handling shifts; map `isCancel(value)` checks to try/catch around inquirer calls |
| `intro`, `outro`, `note`, `message` from clack | `console.log(chalk.bold("..."))` + blank lines |
| `applyStyledHelp(command, { examples, footerLines })` | `command.addHelpText("after", renderExamples(examples))` — write a tiny local helper that emits the same visual pattern but via Commander's built-in `addHelpText` |
| `writeJsonSuccess({ ... })` | A shared `writeJsonEnvelope(success, payload)` helper in bags-cli that emits `{ "success": true, "data": payload }` or `{ "success": false, "error": "..." }` to stdout. Keep shape compatible with play-cli for script consumers |
| `showError(message, { suggestion, exitCode })` | Same helper name, ported to use `chalk.red(...)` and `process.exit(1)` (or the given code); lives in `src/play/utils/output.ts` initially, and **should be consolidated** with bags-cli's `handleCliError` in a follow-up refactor (see [section 13 #E11](#e11-error-helper-duplication)) |
| `createSpinner({ quiet })` | Use a thin `ora` wrapper in `src/play/utils/output.ts` that preserves play-cli's `start` / `message` / `stop` flow while respecting bags-cli's JSON and quiet modes |
| `isJsonMode()` module-global setter from play's `utils/json.ts` | Reuse bags-cli's `shouldUseJson(command)` (which checks Commander global opts) — no module-global mutation. Propagate via `command.optsWithGlobals()` |

### 12.6 Global flags merging in src/index.ts

After integration, bags-cli root flags look like:

```ts
program
  .name("bags")
  .description("Bags CLI — auth, trading, launches, fees, Play, and config")
  .version(cliVersion)
  .option("--json", "Output machine-readable JSON where supported")
  .option("--input-json <json>", "Pass all options as a JSON object")
  .option("-q, --quiet", "Suppress non-error output")
  .option("--no-color", "Disable colored output")
  .option("--play-api <url>", "Override Play API base URL")
  .option("--bags-api <url>", "Override Bags API base URL");
```

All child commands (both existing bags-cli and new Play) use `command.optsWithGlobals()` to receive these, same as play-cli does today.

The `--no-color` handler runs as early as possible in `src/index.ts` — before any chalk-using module is loaded — to set `process.env.NO_COLOR = "1"` if the flag is present (`chalk` respects `NO_COLOR`).

### 12.7 Admin commands labeling

For each admin subcommand in `bags play`, use Commander's `.description(...)` with a `[admin]` suffix:

```ts
program
  .command("patch <appId> <version>")
  .description("Overwrite deployed version [admin]")
  .option("--force", "skip confirmation prompt")
  .option("--token <token>", "admin token (overrides BAGS_PLAY_ADMIN_TOKEN)")
  .action(/* ... */);
```

The `bags play --help` output will include the `[admin]` marker next to these commands. No `.hidden()` — they're discoverable. At runtime, if the command requires an admin token and none is present, show a targeted error: `"This command requires BAGS_PLAY_ADMIN_TOKEN env or --token flag."`.

### 12.8 Lazy-import pattern for heavy commands

Mirror play-cli's pattern. In `src/play/index.ts` (the Play namespace registration), register heavy commands with an inline dynamic import:

```ts
program
  .command("build")
  .description("Build App definition into JSON artifact")
  .option("-o, --output <dir>", "output directory", "release")
  .action(async function () {
    const { executeBuild } = await import("./commands/build.js");
    const opts = this.optsWithGlobals();
    await executeBuild({ ...opts, output: this.opts().output });
  });
```

This works with tsup's `splitting: false` because the bundler inlines the dynamic import target into the same file — cold startup is still fast for `bags play build` because effect-ts / play-sdk code paths aren't touched until needed.

If startup regressions appear, switch tsup to `splitting: true` with explicit chunks for `build/info/publish/patch` — but this changes the distribution model (multiple JS files), so only do it if measurements justify it.

---

## 13. Edge cases and their resolutions

### E1. User has both legacy play-cli and new bags-cli installed

On first `bags play <cmd>`, auto-migrate the credential file. If both files exist, prefer the bags-cli path and leave the legacy file alone (no destructive ops). Print a one-line notice.

### E2. User's existing bags-cli key is a wallet-flow (non-`bags_prod_`) key

Running `bags play <cmd>` shows the D1 error. The user runs `bags auth login --auth-mode manual --api-key <bags_prod_…>`, and `credentials.json.apiKey` is replaced. Other fields are preserved. Wallet functionality continues to work (bags SDK accepts the new key).

### E3. User rotates their `bags_prod_` key

They run `bags auth login --auth-mode manual --api-key <new>`. This updates `credentials.json.apiKey` atomically (via `writeJsonSecure`). All subsequent commands use the new key.

### E4. `bun` missing on `bags play build`

`requireBunOnPath()` throws a CliError with the install instructions. Exit code 1. No partial build artifacts written.

### E5. `bun` present but the project's `bags.toml` sets `runtime = "node"`

Today play-cli's loader throws `Unsupported runtime "node"`. Keep this behaviour — `runtime = "node"` is reserved for future support. Error message: `"Only runtime = \"bun\" is currently supported. Install Bun and update your bags.toml."`.

### E6. User runs `bags play completion --install` on a shell we don't support

Error: `"Unsupported shell: <name>. Supported: bash, zsh, fish."`. Match play-cli's current behaviour.

### E7. User pipes `--json` to a Play command that requires interactive confirmation (e.g. `bags play secrets delete <id>`)

Match play-cli: in JSON mode, destructive commands require `--force` / `--reason` flags. Missing flag → JSON error envelope with exit code 1.

### E8. `NODE_ENV=development` in user's shell triggers pino-pretty load failure

Resolved in Phase 5: keep the main `bags-cli` process untouched and set `NODE_ENV=production` only on the spawned Bun subprocess that executes the local App entry for `bags play build`, `bags play publish`, `bags play patch`, and local-project `bags play info`.

### E9. Shell completion on Windows

play-cli supports bash/zsh/fish — no PowerShell. Keep the same scope for now. Windows users using Git Bash / WSL get bash completion.

### E10. `bags play init` on a directory that already has a `bags.toml`

Same as play-cli: interactive confirm prompt to overwrite, unless `--no-git --no-install` patterns etc. imply automation. In `--json` mode, `init` is rejected (same as play-cli) because it is inherently interactive.

### E11. Error helper duplication

bags-cli has `handleCliError` in `src/utils/errors.ts`. play-cli has `showError` in `utils/output.ts`. After the port, both exist. Consolidation is a non-blocking follow-up: extract a single `bagsError(message, { suggestion, exitCode })` and route both through it. Not required for any phase's exit criteria.

### E12. `--input-json` + Play commands

bags-cli's `--input-json` merges the JSON into any option names at parse time. Play commands now opt into this through a small Play-specific action wrapper. Examples:
- `bags play deployments list --input-json '{"limit":"1"}'` ← works in Phase 2.
- `bags play runs logs run_abc123 --input-json '{"compact":true,"node":"action_1"}'` ← works in Phase 2.
- `bags play secrets create --input-json '{"name":"foo","plugin":"p1","value":"v"}'` ← works in Phase 3.

Verify during Phase 3 that repeatable options deserialize correctly. Add a unit test.

### E13. `bags play plugins register <packageName>` admin command

Requires `BAGS_PLAY_ADMIN_TOKEN`. Marked `[admin]` in help. Scheduled for Phase 4 (packaged with `init`/`info`).

### E14. `bags play deployments get <id> --runs 5`

Parallel fetch: deployment + recent runs. If the recent-runs fetch fails, the deployment is still returned (best-effort — mirror play-cli). Human mode prints a warning and continues. JSON mode keeps the legacy payload shape unchanged and returns `{ ...deployment, recentRuns: [] }`.

### E15. User account has no Play user (key is valid for Bags but not provisioned on Play)

Play `/auth/me` returns 404 / 401. Show the D1 error with a hint: `"Your key is valid for Bags but not linked to a Play account. Visit https://dev.bags.fm to provision Play access."`.

### E16. Rate-limiting / 429 from Play API

`ApiError(status=429)`. Show a specific friendly message: `"Rate limited. Try again in a moment."`. Do not retry automatically in Phase 2/3; defer auto-retry to a future enhancement.

### E17. `bags play publish` when version already exists

play-cli does a pre-flight GET on `/apps/:id/versions/:v` and refuses to publish if non-404. Keep this logic. Error message: `"Version X.Y.Z already exists for <appId>. Bump the version in your entry file and re-run."`.

### E18. Concurrent `bags auth login` on different shells

Last writer wins on `credentials.json` (bags-cli already uses atomic `writeJsonSecure`). Non-issue in practice.

### E19. User has a `bags.toml` but is running a non-Play command (e.g. `bags fees list`)

`bags.toml` is only consulted by Play commands' `resolveApiClientConfig()`. Non-Play commands ignore it entirely. No collision.

### E20. Biome / linting

bags-cli currently has no linter. play-cli uses Biome with catalog-pinned versions (in the play monorepo). After the port, we may want to add Biome to bags-cli for consistency — non-blocking follow-up, tracked separately from this integration.

---

## 14. Open questions and assumptions

### Q1. Template source for Phase 4

**Question:** Should Phase 4 read templates from a published shared package, the play monorepo directly, or a local copy inside `bags-cli`?

**Resolved during Phase 4 planning:** use a local copy under `src/play/templates/source/` and generate `src/play/templates/embedded.ts` from it. This keeps the integrated CLI self-contained and unblocks delivery without waiting on a new published templates package.

**Follow-up:** after the integration lands, we can still evaluate consolidating template ownership into a published package if drift becomes painful.

### Q2. Effect-ts runtime tree-shaking

**Question:** How large is the bags-cli bundle once `effect` and `zod` are inlined via tsup `noExternal`?

**Assumption:** `effect` is ~1.2MB minified. Acceptable for a global CLI. Measure during Phase 5; if it crosses 3MB, evaluate splitting heavy command chunks.

**Owner:** Phase 5 implementer.

### Q3. Biome / lint / test bootstrap

**Question:** Does bags-cli adopt Biome + bun test / vitest during this integration?

**Assumption:** A repo-wide testing/linting strategy is still out of scope, but the integrated Play command surface now has focused `bun test` coverage in `test/play/`. We still do **not** attempt to port the standalone play-cli test suite wholesale into bags-cli.

**Owner:** follow-up task after integration completes.

### Q4. Pino behaviour in Node-bundled SDK

**Resolved in Phase 5:** Use the scoped `NODE_ENV=production` shim only when spawning the Bun subprocess for local entry execution. Do not mutate `process.env.NODE_ENV` globally in `bags-cli`.

### Q5. Admin token UX for non-admin users

**Question:** If a user accidentally runs `bags play deployments pause` without admin auth, do we show the flag requirement, or silently 401?

**Resolved during Phase 3 planning:** We show a targeted message up-front: `"This command requires admin access. Set BAGS_PLAY_ADMIN_TOKEN or pass --token <token>."`. No API call if the token is absent. Admin commands accept either `--token <token>` or `BAGS_PLAY_ADMIN_TOKEN`, with the CLI flag taking precedence.

**Owner:** Phase 3 / 5 implementer.

### Q6. `bags-cli` existing `settings output` mode "table"

**Question:** The existing `bags settings set --output table` mode appears half-implemented — `printData` doesn't branch on it. Does `"table"` mean "format compatible output" (today's behavior in `printTable`-using commands) or something broader?

**Assumption:** Out of scope for this integration. Flag it for a separate bug-fix task.

**Owner:** separate bags-cli maintenance task.

### Q7. Release gating for phases

**Question:** Does each phase ship a new npm release of `@bagsfm/bags-cli`, or do we batch phases?

**Assumption:** Versioning is deferred per D15. Default to phase-per-release unless the owner says otherwise.

**Owner:** release manager.

---

## 15. File and directory plan for bags-cli

Target layout after Phase 5. Only `src/play/` and a few root-level additions are new.

```text
bags-cli/
├── PLAY_INTEGRATION.md                (this file)
├── AUTH_MODES_IMPLEMENTATION.md       (existing)
├── README.md                          (update with `bags play` usage)
├── package.json                       (add play-sdk/shared deps, hono, smol-toml; adjust scripts)
├── tsup.config.ts                     (add noExternal list)
├── tsconfig.json                      (unchanged)
├── scripts/
│   ├── bump-version.mjs               (existing)
│   └── embed-play-templates.ts        (NEW — codegen for template embedding)
└── src/
    ├── index.ts                       (merge root flags, register Play; add `__complete` hook)
    ├── version.ts                     (existing)
    ├── commands/                      (existing bags-cli commands untouched)
    ├── lib/                           (existing)
    ├── utils/                         (existing)
    └── play/                          (NEW — everything Play-related)
        ├── index.ts                   (registerPlayCommands(program))
        ├── api/
        │   ├── client.ts              (port of play-cli's api/client.ts, Node-native)
        │   └── auth.ts                (validateApiKey, validateApiKeyFormat, maskApiKey)
        ├── config/
        │   ├── project.ts             (read bags.toml via smol-toml)
        │   └── credentials-migrate.ts (legacy env-paths migration helper)
        ├── commands/
        │   ├── art.ts                 (Phase 1)
        │   ├── completion/
        │   │   ├── index.ts
        │   │   ├── completer.ts
        │   │   └── scripts.ts
        │   ├── whoami.ts              (Phase 1)
        │   ├── init/
        │   │   ├── index.ts           (Phase 4)
        │   │   ├── prompts.ts
        │   │   ├── scaffold.ts
        │   │   ├── templates.ts       (uses embedded.ts)
        │   │   └── skills.ts
        │   ├── plugins/
        │   │   ├── index.ts
        │   │   ├── list.ts            (Phase 2)
        │   │   ├── info.ts            (Phase 2)
        │   │   └── register.ts        (Phase 4, admin)
        │   ├── secrets/
        │   │   ├── index.ts
        │   │   ├── list.ts            (Phase 2)
        │   │   ├── create.ts          (Phase 3)
        │   │   ├── update.ts          (Phase 3)
        │   │   └── delete.ts          (Phase 3)
        │   ├── deployments/
        │   │   ├── index.ts
        │   │   ├── list.ts            (Phase 2)
        │   │   ├── get.ts             (Phase 2)
        │   │   ├── pause.ts           (Phase 3, admin)
        │   │   ├── unpause.ts         (Phase 3, admin)
        │   │   ├── lifecycle.ts
        │   │   └── format.ts
        │   ├── runs/
        │   │   ├── index.ts
        │   │   ├── list.ts            (Phase 2)
        │   │   ├── get.ts             (Phase 2)
        │   │   ├── fees.ts            (Phase 2)
        │   │   ├── logs.ts            (Phase 2)
        │   │   ├── cancel.ts          (Phase 3)
        │   │   ├── trigger.ts         (Phase 3)
        │   │   └── format.ts
        │   ├── info.ts                (Phase 4 remote branch; Phase 5 local branch)
        │   ├── build.ts               (Phase 5)
        │   ├── publish.ts             (Phase 5)
        │   ├── patch.ts               (Phase 5, admin)
        │   └── verify.ts              (Phase 5, admin)
        ├── templates/
        │   ├── source/                (locally vendored copy of Play CLI templates)
        │   └── embedded.ts            (generated by scripts/embed-play-templates.ts)
        └── utils/
            ├── command.ts             (Play action wrapper + UI state resolution)
            ├── command-client.ts      (Command-scoped Play API client resolution)
            ├── bun-runtime.ts         (findBun, requireBunOnPath, executeEntryFileWithBun)
            ├── output.ts              (spinner wrapper, showError/showSuccess — delegates to bags-cli chalk)
            ├── json-envelope.ts       (writeJsonSuccess / writeJsonError helpers)
            ├── help.ts                (renderExamples helper for addHelpText)
            └── format.ts              (tables, masking, etc.)
```

Notes on integration points with existing bags-cli code:

- `src/play/config/credentials-migrate.ts` imports `loadCredentials`, `saveCredentials`, and `BAGS_CREDENTIALS_PATH` from the existing `src/lib/credentials.ts` and `src/lib/paths.ts` — no new credential file abstraction.
- `src/play/utils/output.ts` uses `ora` directly with a thin Play wrapper so commands can keep the old `start` / `message` / `stop` flow while still matching bags-cli's UX stack.
- `src/play/utils/json-envelope.ts` is new (bags-cli's `printData` has a different shape). Play commands use this helper so their `--json` output stays compatible with scripts that consume play-cli today.
- `src/play/commands/completion/` is the only place that needs to know about the outer binary name `bags`. The hidden `__complete` hook at root (`src/index.ts`) dispatches into `src/play/commands/completion/completer.ts`.

---

## 16. Success criteria

The integration is complete when **all** of the following are true:

1. **Functional parity:** every play-cli command listed in [section 11](#11-command-migration-matrix) (except `upgrade`, which is dropped) works identically under `bags play <cmd>` from a user's standpoint — same flags, same outputs (barring UX library swaps), same exit codes.
2. **Single artifact:** `npm i -g @bagsfm/bags-cli` is the only install step needed. No separate play-cli install exists for end users.
3. **Single credentials file:** a user who logs in once (via any of the three paths) can run every Bags command and every Play command without re-authenticating.
4. **No Bun required for non-build commands:** a machine with only Node (no bun) can run every `bags play` command except `build`, `publish`, `patch`, and `info` (local-project branch). Those four print a friendly install-bun message.
5. **Auto-migration:** a user who had play-cli installed before the integration can run `bags play whoami` immediately after upgrading and it works (no manual re-login required).
6. **Help is discoverable:** `bags --help` shows the `play` group; `bags play --help` shows all Play subcommands; admin commands are visibly labeled `[admin]`.
7. **JSON mode parity:** scripts that used `bags <cmd> --json` against play-cli produce the same JSON shape when run against `bags play <cmd> --json`.
8. **play-cli stops publishing:** `npm view @bagsfm/play-cli` confirms no new versions published after Phase 0.
9. **bags-cli bundle stays manageable:** `dist/index.js` is under ~5MB (measure after Phase 5 — informational, not a hard gate).
10. **No regressions in existing bags-cli commands:** `bags setup`, `bags auth login`, `bags wallet balance`, `bags fees list`, `bags trade quote`, `bags launch create`, `bags settings show` all behave identically to `0.1.5`.

---

## 17. References

### Primary sources (code)

- `/Users/alaa/bags/bags-cli/src/index.ts` — bags-cli entry, root flags, command registration.
- `/Users/alaa/bags/bags-cli/src/lib/auth.ts` — agent wallet-signature flow + manual mode validation.
- `/Users/alaa/bags/bags-cli/src/lib/credentials.ts` — credentials schema and read/write.
- `/Users/alaa/bags/bags-cli/src/lib/paths.ts` — hardcoded `~/.config/bags/` paths.
- `/Users/alaa/bags/bags-cli/src/lib/sdk.ts` — `BagsSDK` construction.
- `/Users/alaa/bags/bags-cli/src/commands/*.ts` — every current command module.
- `/Users/alaa/bags/bags-cli/AUTH_MODES_IMPLEMENTATION.md` — dual auth mode spec (wallet / manual).
- `/Users/alaa/bags/play.bags/packages/cli/src/cli.ts` — play-cli entry.
- `/Users/alaa/bags/play.bags/packages/cli/src/api/client.ts` — hono client, `resolveApiClientConfig`, `ApiError`, `callApi`.
- `/Users/alaa/bags/play.bags/packages/cli/src/config/paths.ts` — `env-paths`-based config dir.
- `/Users/alaa/bags/play.bags/packages/cli/src/config/credentials.ts` — `bags_prod_` prefix check.
- `/Users/alaa/bags/play.bags/packages/cli/src/utils/loader.ts` — Bun subprocess entry loader (must be ported to node:child_process).
- `/Users/alaa/bags/play.bags/packages/cli/src/utils/builder.ts` — `performBuild` + validation via `@bagsfm/play-sdk/app-utils`.
- `/Users/alaa/bags/play.bags/packages/cli/src/commands/init/embedded-templates.ts` — Bun file-embed pattern for templates (to be replaced with a tsup codegen).
- `/Users/alaa/bags/play.bags/packages/cli/src/commands/runs/logs.ts` — representative port example (spinner + JSON + formatter).
- `/Users/alaa/bags/play.bags/packages/cli/src/commands/init/index.ts` — scaffolding flow with prompts.
- `/Users/alaa/bags/play.bags/packages/cli/templates/` — app and plugin templates to be vended through `@bagsfm/play-sdk` or a dedicated `@bagsfm/play-templates` package.
- `/Users/alaa/bags/play.bags/packages/sdk/package.json` — SDK publish config; flip to public in Phase 0.
- `/Users/alaa/bags/play.bags/packages/cli/package.json` — play-cli manifest; mark private in Phase 0.

### Companion docs in play.bags

- `/Users/alaa/bags/play.bags/.cursor/rules/*.mdc` — monorepo conventions (especially `technical-stack.mdc`, `conventions.mdc`, `distributed-safety.mdc`). Only relevant when Phase 0 changes touch the play monorepo.
- `/Users/alaa/bags/play.bags/packages/cli/src/commands/init/README.md` — init command architecture, used as reference when porting init.
- `/Users/alaa/bags/play.bags/packages/cli/entitlements.plist` — macOS signing entitlements for the standalone binary; no longer relevant after Phase 0 (binary is no longer shipped).

### External references

- `commander@14` — https://github.com/tj/commander.js
- `tsup` — https://tsup.egoist.dev
- `env-paths` behaviour for replicated migration logic — https://github.com/sindresorhus/env-paths#api
- `bun install` docs — https://bun.sh/docs/installation
- `@inquirer/prompts` — https://github.com/SBoudrias/Inquirer.js
- `hono/client` — https://hono.dev/guides/rpc

---

**End of document.**

When in doubt, read this file first. Every decision here was made with the product owner present and should not be changed without explicit re-confirmation.
