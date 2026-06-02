# NFT Marketplace

A Solana NFT marketplace program built with Anchor. It is designed around
Metaplex Core assets, so a seller can list an asset, a buyer can purchase it
with SOL, and the marketplace can collect a configurable fee into a treasury
PDA.

This is a learning-friendly marketplace project, but the structure is close to
what you would expect in a real on-chain app: explicit PDA accounts, escrowed
offers, marketplace fees, and reward minting for buyers.

## What This Program Does

The marketplace supports these flows:

- Initialize a marketplace with a name, admin, fee rate, treasury PDA, and
  rewards mint.
- List a Metaplex Core asset by transferring it into a listing PDA.
- Buy a listed asset with SOL.
- Delist an asset and return it to the seller.
- Make an offer by escrow-locking SOL inside an offer PDA.
- Withdraw an open offer and recover the escrow.
- Accept an offer, move marketplace fees into the treasury, and transfer the
  asset to the offer maker.
- Let the marketplace admin withdraw accumulated treasury fees.

The fee is stored as basis points. For example, `250` means `2.5%`, and `500`
means `5%`.

## Program Accounts

`Marketplace`

Stores the marketplace configuration:

- `admin`: wallet allowed to withdraw treasury fees
- `fee`: marketplace fee in basis points
- `name`: marketplace name used in PDA derivation
- `bump`, `treasury_bump`, `rewards_bump`: PDA bumps

`Listing`

Stores an active listed asset:

- `maker`: seller wallet
- `asset`: Metaplex Core asset address
- `price`: sale price in lamports
- `bump`: listing PDA bump

`Offer`

Stores an escrowed offer:

- `maker`: buyer wallet that made the offer
- `asset`: asset the offer targets
- `price`: escrowed offer amount in lamports
- `bump`: offer PDA bump

## Project Structure

```text
programs/nft-marketplace/src/
  lib.rs                    Program entrypoints
  state.rs                  Marketplace, Listing, and Offer accounts
  errors.rs                 Custom program errors
  instructions/
    initialize.rs           Create marketplace, treasury, and rewards mint
    list.rs                 Transfer asset into a listing PDA
    buy.rs                  Pay seller, collect fee, transfer NFT, mint reward
    delist.rs               Return listed asset to seller
    make_offer.rs           Escrow SOL into an offer PDA
    accept_offer.rs         Accept offer and transfer asset
    withdraw.rs             Close offer and return escrow
    withdraw_fee.rs         Admin treasury withdrawal

tests/nft-marketplace.ts    Anchor TypeScript integration tests
```

## Requirements

You will need:

- Rust
- Solana CLI
- Anchor CLI `0.31.1`
- Node.js
- Yarn

The project currently uses:

- `anchor-lang = 0.31.1`
- `anchor-spl = 0.31.1`
- `mpl-core = 0.11.2`
- `@coral-xyz/anchor = ^0.31.1`

## Setup

Install JavaScript dependencies:

```bash
yarn install
```

Make sure your local Solana keypair exists:

```bash
solana-keygen new
```

If you already have a keypair at `~/.config/solana/id.json`, you can skip that.

## Build

Build the Anchor program:

```bash
anchor build
```

After a successful build, Anchor generates:

```text
target/deploy/nft_marketplace.so
target/idl/nft_marketplace.json
target/types/nft_marketplace.ts
```

You may see a warning from `mpl-core` about stack offset during the build. At
the moment it does not stop the program from building or the tests from
passing, but it is worth keeping an eye on before production deployment.

## Test

Run the full Anchor test suite:

```bash
anchor test
```

The test script is configured in `Anchor.toml` and runs the TypeScript tests:

```bash
yarn run ts-mocha -p ./tsconfig.json -t 1000000 tests/**/*.ts
```

The current tests cover:

- Marketplace initialization
- PDA derivation and stored account state
- Treasury and rewards mint ownership
- Offer escrow creation
- Offer withdrawal and account closure
- Admin-only treasury fee withdrawal

The tests intentionally avoid the full Metaplex Core list/buy flow for now,
because that requires creating real MPL Core assets and exercising CPI asset
ownership. That would be the next valuable test layer to add.

## Local Validator Notes

`Anchor.toml` is configured for localnet and clones the Metaplex Core program:

```toml
[[test.validator.clone]]
address = "CoREENxT6tW1HoK8ypY1SxRMZTcVPm7R94rH4PZNhX7d"
```

That lets local tests and future CPI tests reference the real MPL Core program
ID.

## Main Instructions

`initialize(name, fee)`

Creates the marketplace account, treasury PDA, and rewards mint. The
marketplace name is part of the PDA seed, so each marketplace name maps to a
different marketplace account.

`list(price)`

Creates a listing PDA and transfers the seller's MPL Core asset into that PDA.
The listing PDA becomes the temporary owner of the asset.

`buy()`

Transfers SOL from the buyer to the seller and treasury, transfers the asset
from the listing PDA to the buyer, closes the listing, and mints one reward
token to the buyer.

`make_offer(price)`

Creates an offer PDA and transfers the offer amount into it. This acts as SOL
escrow for the offer.

`withdraw()`

Closes the caller's offer account. Since the offer account is closed to the
maker, the escrowed lamports are returned.

`accept_offer()`

Accepts an offer for a listed asset. The program moves the marketplace fee into
the treasury and transfers the asset to the offer maker.

`withdraw_fee(amount)`

Allows only the marketplace admin to withdraw lamports from the treasury PDA.

