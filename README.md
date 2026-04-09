# bags-cli

Fast, global-installable CLI for Bags authentication, trading, launches, fees, and configuration.

## Install

```bash
npm i -g bags-cli
```

Or run without global install:

```bash
npx bags-cli --help
```

After installation, use:

```bash
bags --help
```

## Quick Start

Run the setup wizard to configure RPC, import your wallet, and authenticate in one step:

```bash
bags setup
```

Or pass flags for non-interactive use:

```bash
bags setup --rpc-url https://my-rpc.example.com --private-key <base58_or_int_array>
```

The wizard accepts private keys as **base58** or **int array** format (auto-detected).

Once set up, verify everything is working:

```bash
bags auth status
bags wallet balance
```

## Command Groups

- `bags setup` - first-run wizard (RPC, wallet import, auth)
- `bags auth` - agent wallet signature authentication and credential storage
- `bags wallet` - local keypair management
- `bags fees` - list and claim fees, plus fee analytics endpoints
- `bags trade` - get quotes and execute swaps
- `bags launch` - full token launch workflow
- `bags config` - fee share config creation/update/admin transfer
- `bags partner` - partner config and claim flows
- `bags pool` - pool lookup endpoints
- `bags dexscreener` - check/create/pay Dexscreener orders
- `bags incorporation` - incorporation payment and project workflows
- `bags settings` - CLI defaults (`rpcUrl`, commitment, output mode)

## Interactive + Flags

Commands are interactive by default and every prompt can be overridden with flags.  
For example:

```bash
bags trade quote \
  --input-mint So11111111111111111111111111111111111111112 \
  --output-mint <TOKEN_MINT> \
  --amount 1000000 \
  --slippage-mode auto
```

## Configuration Files

Stored under `~/.config/bags/`:

- `keypair.json`
- `credentials.json`
- `config.json`

The CLI writes these files with restrictive permissions (`0600`).

## Build From Source

```bash
npm install
npm run typecheck
npm run build
node dist/index.js --help
```
