# NFT Marketplace

A Solana NFT marketplace program built with Anchor. It works with Metaplex Core
assets and supports the usual marketplace lifecycle: initialize a marketplace,
list an asset, buy it, delist it, make offers, accept offers, cancel offers,
and withdraw marketplace fees.

The project also includes the extra token-payment path: a listing can be priced
in an SPL token mint, and `buy_with_token` splits the buyer's tokens between the
seller and the marketplace treasury ATA with `token_interface::transfer_checked`.

## What It Does

- Creates a marketplace with an admin, fee rate, treasury PDA, and rewards mint.
- Lists Metaplex Core assets by moving them into a listing PDA.
- Supports SOL-priced listings through `list` and `buy`.
- Supports SPL-token-priced listings through `list_with_token` and
  `buy_with_token`.
- Lets sellers delist and recover their asset.
- Lets buyers make SOL offers escrowed in an offer PDA.
- Lets buyers cancel offers and recover escrowed SOL.
- Lets sellers accept offers and transfer the asset to the buyer.
- Lets the marketplace admin withdraw accumulated SOL treasury fees.

Fees are stored as basis points. For example, `250` means `2.5%`, and `500`
means `5%`.

## Accounts

`Marketplace`

- `admin`: wallet allowed to withdraw SOL treasury fees
- `fee`: marketplace fee in basis points
- `name`: marketplace name used in PDA derivation
- `bump`, `treasury_bump`, `rewards_bump`: PDA bumps

`Listing`

- `maker`: seller wallet
- `asset`: Metaplex Core asset address
- `payment_mint`: payment marker for the listing
- `price`: sale price in lamports or token base units
- `bump`: listing PDA bump

For SOL listings, `payment_mint` is the system program id. For SPL token
listings, it is the token mint used for payment.

`Offer`

- `maker`: buyer wallet that made the offer
- `asset`: asset the offer targets
- `price`: escrowed SOL amount
- `bump`: offer PDA bump

Offer PDAs use:

```text
[b"offer", asset, buyer]
```

## Project Structure

```text
programs/nft-marketplace/src/
  lib.rs                    Program entrypoints
  state.rs                  Marketplace, Listing, and Offer accounts
  errors.rs                 Custom program errors
  instructions/
    initialize.rs           Create marketplace, treasury, and rewards mint
    list.rs                 SOL and SPL-token listing instructions
    buy.rs                  SOL and SPL-token buy instructions
    delist.rs               Return listed asset to seller
    make_offer.rs           Escrow SOL into an offer PDA
    accept_offer.rs         Accept an offer and transfer the asset
    cancel_offer.rs         Close an offer and return escrow
    withdraw_fee.rs         Admin treasury withdrawal

tests/nft-marketplace.ts    TypeScript integration tests
```

## Requirements

- Rust
- Solana CLI
- Anchor CLI `0.31.1`
- Node.js
- Yarn

Main dependencies:

- `anchor-lang = 0.31.1`
- `anchor-spl = 0.31.1`
- `mpl-core = 0.11.2`
- `@coral-xyz/anchor = ^0.31.1`
- `@metaplex-foundation/mpl-core = ^1.10.0`
- `@solana/spl-token = ^0.4.14`

## Setup

Install dependencies:

```bash
yarn install
```

Make sure you have a local Solana keypair:

```bash
solana-keygen new
```

If `~/.config/solana/id.json` already exists, you can keep using it.

## Build

```bash
anchor build
```

Anchor generates:

```text
target/deploy/nft_marketplace.so
target/idl/nft_marketplace.json
target/types/nft_marketplace.ts
```

You may see an `mpl-core` stack-offset warning during build. The program still
builds and the full test suite passes, but it is worth watching before a real
deployment.

## Test

```bash
anchor test
```

`Anchor.toml` runs the TypeScript suite:

```bash
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

The tests cover every marketplace entrypoint:

- `initialize`
- `list`
- `list_with_token`
- `buy`
- `buy_with_token`
- `delist`
- `make_offer`
- `accept_offer`
- `cancel_offer`
- `withdraw_fee`

The suite creates real Metaplex Core assets on the local validator, so the NFT
transfer paths exercise the actual MPL Core CPI flow. It also creates an SPL
token mint and verifies that token payments are split between the seller ATA
and marketplace treasury ATA.

## Passing Tests

![Anchor test run showing 7 passing tests]

## Local Validator

`Anchor.toml` is configured for localnet and clones the Metaplex Core program:

```toml
[[test.validator.clone]]
address = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
```

That lets the tests create and transfer Metaplex Core assets locally.

## Instruction Notes

`initialize(name, fee)`

Creates the marketplace account, SOL treasury PDA, and rewards mint. The
marketplace name is part of the marketplace PDA seed.

`list(price)`

Creates a SOL-priced listing and transfers the seller's asset into the listing
PDA.

`list_with_token(price)`

Creates an SPL-token-priced listing, stores the payment mint on the listing,
and transfers the seller's asset into the listing PDA.

`buy()`

Pays in SOL, sends the marketplace fee to the treasury PDA, transfers the asset
to the buyer, closes the listing, and mints one reward token.

`buy_with_token()`

Pays in an SPL token. The buyer's token account is split between the seller's
ATA and the marketplace treasury ATA using `transfer_checked`, then the asset
is transferred and one reward token is minted.

`delist()`

Transfers the listed asset back to the seller and closes the listing.

`make_offer(price)`

Creates an offer PDA and escrows SOL into it.

`accept_offer()`

Moves the offer fee into the SOL treasury, closes the offer and listing, and
transfers the asset to the offer maker.

`cancel_offer()`

Closes the buyer's offer account. The escrowed lamports return to the buyer
through Anchor's `close` behavior.

`withdraw_fee(amount)`

Allows only the marketplace admin to withdraw lamports from the SOL treasury
PDA.
