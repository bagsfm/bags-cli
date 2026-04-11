# Dual Auth Mode Implementation

This document summarizes the CLI changes for dual authentication mode support.

## What Changed

- Upgraded `@bagsfm/bags-sdk` to `^1.3.7`.
- Added support for two auth modes:
  - `wallet` (default): existing wallet-signature auth flow.
  - `manual`: user provides API key, validated using `sdk.auth.me()`.
- Extended both `bags setup` and `bags auth login` to accept mode selection.
- Added non-interactive safety checks so manual mode fails fast when no API key is provided.
- Added credential metadata (`authMode`) to preserve how credentials were created.

## Files Updated

- `package.json`
- `package-lock.json`
- `src/lib/auth.ts`
- `src/lib/credentials.ts`
- `src/commands/auth.ts`
- `src/commands/setup.ts`

## New/Updated CLI Flags

### `bags auth login`

- `--auth-mode <wallet|manual>` (default: `wallet`)
- `--api-key <key>` (required when `--auth-mode manual`)
- existing:
  - `--keypair <path>`
  - `--key-name <name>`

### `bags setup`

- `--auth-mode <wallet|manual>` (default: `wallet`)
- `--api-key <key>` (required when `--auth-mode manual`)
- existing:
  - `--rpc-url <url>`
  - `--private-key <key>`
  - `--key-name <name>`

## Behavior Details

## 1) Wallet Mode (default)

Both `setup` and `auth login` keep the existing flow:

1. Resolve local keypair (`--keypair` or default path).
2. Start agent auth challenge (`/agent/v2/auth/init`).
3. Sign challenge with local wallet.
4. Submit callback and optional MFA.
5. Save credentials to `~/.config/bags/credentials.json`.

Saved credential shape now includes:

- `apiKey`
- `keyId` (if returned)
- `authMode: "wallet"`
- `walletAddress`
- `authenticatedAt`

## 2) Manual Mode

For `--auth-mode manual`:

1. Resolve API key from:
   - `--api-key`, or
   - `--input-json` with `apiKey`, or
   - interactive secret prompt (`Enter API key:`).
2. Validate API key via SDK:
   - create temporary SDK context
   - call `sdk.auth.me()`
3. Resolve/generate local keypair (ensures a usable private key exists).
4. Save credentials with:
   - `apiKey`
   - `authMode: "manual"`
   - `walletAddress`
   - `authenticatedAt`

## Non-Interactive and JSON Support

`--input-json` is merged into command options before runtime validation, so the following works:

```bash
bags auth login --input-json '{"authMode":"manual","apiKey":"<your_key>"}'
```

In non-interactive environments (no TTY), manual mode now throws a clear error if `apiKey` is missing:

`Manual auth mode requires --api-key (or --input-json '{"apiKey":"..."}') in non-interactive environments.`

This avoids hanging prompts in CI automation.

## Auth Status Output

`bags auth status` now includes `authMode` (`wallet` or `manual`) in output, while still masking API key values.

## Compatibility Notes

- Existing wallet-based users continue to work without changes.
- Existing credentials without `authMode` are normalized to `wallet` on load.
- SDK-backed command execution remains unchanged (`getSdkContext` still consumes saved credentials).

## Example Usage

### Wallet mode (default)

```bash
bags auth login
```

```bash
bags setup --private-key "<base58_or_array>"
```

### Manual mode (flags)

```bash
bags auth login --auth-mode manual --api-key "<public_api_key>"
```

```bash
bags setup --private-key "<base58_or_array>" --auth-mode manual --api-key "<public_api_key>"
```

### Manual mode (`--input-json`)

```bash
bags auth login --input-json '{"authMode":"manual","apiKey":"<public_api_key>"}'
```

```bash
bags setup --input-json '{"privateKey":"<base58_or_array>","authMode":"manual","apiKey":"<public_api_key>"}'
```

## Validation and Test Checklist

- Dependency upgrade:
  - `npm ls @bagsfm/bags-sdk` shows `1.3.7`.
- Quality gates:
  - `npm run typecheck` passes.
  - `npm run build` passes.
- Runtime checks:
  - invalid mode errors.
  - manual mode without API key fails fast in non-interactive mode.
- Remaining manual verification (requires real key):
  - valid key in manual mode saves credentials successfully.
  - invalid key in manual mode surfaces validation error from `sdk.auth.me()`.
  - subsequent SDK commands run after successful manual auth.
