import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  keypairIdentity,
  publicKey,
} from "@metaplex-foundation/umi";
import {
  fromWeb3JsKeypair,
  fromWeb3JsPublicKey,
  toWeb3JsPublicKey,
} from "@metaplex-foundation/umi-web3js-adapters";
import {
  createV1,
  fetchAssetV1,
  mplCore,
  MPL_CORE_PROGRAM_ID,
} from "@metaplex-foundation/mpl-core";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createMint,
  getAccount,
  getAssociatedTokenAddressSync,
  getOrCreateAssociatedTokenAccount,
  mintTo,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { assert } from "chai";
import { NftMarketplace } from "../target/types/nft_marketplace";

describe("nft-marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nftMarketplace as Program<NftMarketplace>;
  const payer = (provider.wallet as anchor.Wallet).payer;
  const admin = payer.publicKey;
  const systemProgram = anchor.web3.SystemProgram.programId;
  const mplCoreProgram = new anchor.web3.PublicKey(MPL_CORE_PROGRAM_ID);
  const associatedTokenProgram = ASSOCIATED_TOKEN_PROGRAM_ID;
  const tokenProgram = TOKEN_PROGRAM_ID;
  const solPaymentMint = systemProgram;

  const umi = createUmi(provider.connection).use(mplCore());

  const uniqueName = (prefix: string) =>
    `${prefix}-${Date.now().toString(36).slice(-8)}-${Math.floor(
      Math.random() * 1000
    )}`;

  const deriveMarketplace = (name: string) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("marketplace"), Buffer.from(name)],
      program.programId
    );

  const deriveTreasury = (marketplace: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("treasury"), marketplace.toBuffer()],
      program.programId
    );

  const deriveRewardsMint = (marketplace: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("rewards"), marketplace.toBuffer()],
      program.programId
    );

  const deriveListing = (asset: anchor.web3.PublicKey) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("listing"), asset.toBuffer()],
      program.programId
    );

  const deriveOffer = (
    asset: anchor.web3.PublicKey,
    maker: anchor.web3.PublicKey
  ) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), asset.toBuffer(), maker.toBuffer()],
      program.programId
    );

  const rewardsAta = (
    rewardsMint: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey
  ) =>
    getAssociatedTokenAddressSync(
      rewardsMint,
      owner,
      false,
      tokenProgram,
      associatedTokenProgram
    );

  const paymentAta = (
    mint: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey,
    allowOwnerOffCurve = false
  ) =>
    getAssociatedTokenAddressSync(
      mint,
      owner,
      allowOwnerOffCurve,
      tokenProgram,
      associatedTokenProgram
    );

  const fund = async (keypair: anchor.web3.Keypair) => {
    await provider.connection.confirmTransaction(
      await provider.connection.requestAirdrop(
        keypair.publicKey,
        5 * anchor.web3.LAMPORTS_PER_SOL
      ),
      "confirmed"
    );
  };

  const createMarketplace = async (fee = 250) => {
    const name = uniqueName("market");
    const [marketplace, marketplaceBump] = deriveMarketplace(name);
    const [treasury, treasuryBump] = deriveTreasury(marketplace);
    const [rewardsMint, rewardsBump] = deriveRewardsMint(marketplace);

    await program.methods
      .initialize(name, fee)
      .accounts({
        admin,
        marketplace,
        treasury,
        rewardsMint,
        systemProgram,
        tokenProgram,
      })
      .rpc();

    return {
      name,
      fee,
      marketplace,
      marketplaceBump,
      treasury,
      treasuryBump,
      rewardsMint,
      rewardsBump,
    };
  };

  const createCoreAsset = async (
    owner: anchor.web3.PublicKey,
    authority = payer
  ) => {
    const localUmi = umi.use(
      keypairIdentity(fromWeb3JsKeypair(authority), true)
    );
    const asset = generateSigner(localUmi);

    await createV1(localUmi, {
      asset,
      owner: fromWeb3JsPublicKey(owner),
      name: uniqueName("asset"),
      uri: "https://example.com/asset.json",
    }).sendAndConfirm(localUmi);

    return toWeb3JsPublicKey(asset.publicKey);
  };

  const expectAssetOwner = async (
    asset: anchor.web3.PublicKey,
    owner: anchor.web3.PublicKey
  ) => {
    const account = await fetchAssetV1(umi, publicKey(asset.toBase58()));
    assert.strictEqual(account.owner, owner.toBase58());
  };

  const makePaymentMint = async (
    owner: anchor.web3.PublicKey,
    amount: number
  ) => {
    const mint = await createMint(
      provider.connection,
      payer,
      admin,
      null,
      6,
      undefined,
      undefined,
      tokenProgram
    );

    const ownerAta = await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      mint,
      owner,
      false,
      undefined,
      undefined,
      tokenProgram,
      associatedTokenProgram
    );

    await mintTo(
      provider.connection,
      payer,
      mint,
      ownerAta.address,
      admin,
      amount,
      [],
      undefined,
      tokenProgram
    );

    return { mint, ownerAta: ownerAta.address };
  };

  it("initializes marketplace PDAs with the expected state", async () => {
    const market = await createMarketplace(250);
    const marketplaceAccount = await program.account.marketplace.fetch(
      market.marketplace
    );
    const treasuryAccount = await provider.connection.getAccountInfo(
      market.treasury
    );
    const rewardsMintAccount = await provider.connection.getAccountInfo(
      market.rewardsMint
    );

    assert.strictEqual(marketplaceAccount.name, market.name);
    assert.strictEqual(marketplaceAccount.fee, market.fee);
    assert.strictEqual(marketplaceAccount.bump, market.marketplaceBump);
    assert.strictEqual(marketplaceAccount.treasuryBump, market.treasuryBump);
    assert.strictEqual(marketplaceAccount.rewardsBump, market.rewardsBump);
    assert.isTrue(marketplaceAccount.admin.equals(admin));
    assert.isTrue(treasuryAccount?.owner.equals(systemProgram));
    assert.isTrue(rewardsMintAccount?.owner.equals(tokenProgram));
  });

  it("lists and delists an MPL Core asset", async () => {
    const asset = await createCoreAsset(admin);
    const [listing, listingBump] = deriveListing(asset);

    await program.methods
      .list(new anchor.BN(1_000_000))
      .accounts({
        maker: admin,
        asset,
        collection: null,
        listing,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    const listingAccount = await program.account.listing.fetch(listing);
    assert.isTrue(listingAccount.maker.equals(admin));
    assert.isTrue(listingAccount.asset.equals(asset));
    assert.isTrue(listingAccount.paymentMint.equals(solPaymentMint));
    assert.strictEqual(listingAccount.bump, listingBump);
    await expectAssetOwner(asset, listing);

    await program.methods
      .delist()
      .accounts({
        maker: admin,
        asset,
        collection: null,
        listing,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    assert.isNull(await provider.connection.getAccountInfo(listing));
    await expectAssetOwner(asset, admin);
  });

  it("buys a SOL-priced listing and sends rewards", async () => {
    const market = await createMarketplace(500);
    const taker = anchor.web3.Keypair.generate();
    await fund(taker);

    const asset = await createCoreAsset(admin);
    const [listing] = deriveListing(asset);
    const price = new anchor.BN(2_000_000);
    const fee = 100_000;
    const takerRewardsAta = rewardsAta(market.rewardsMint, taker.publicKey);

    await program.methods
      .list(price)
      .accounts({
        maker: admin,
        asset,
        collection: null,
        listing,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    const makerBefore = await provider.connection.getBalance(admin);
    const treasuryBefore = await provider.connection.getBalance(
      market.treasury
    );

    await program.methods
      .buy()
      .accounts({
        taker: taker.publicKey,
        maker: admin,
        asset,
        collection: null,
        marketplace: market.marketplace,
        listing,
        treasury: market.treasury,
        rewardsMint: market.rewardsMint,
        takerRewardsAta,
        mplCoreProgram,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([taker])
      .rpc();

    const makerAfter = await provider.connection.getBalance(admin);
    const treasuryAfter = await provider.connection.getBalance(market.treasury);
    const rewards = await getAccount(
      provider.connection,
      takerRewardsAta,
      undefined,
      tokenProgram
    );

    assert.isNull(await provider.connection.getAccountInfo(listing));
    assert.strictEqual(treasuryAfter - treasuryBefore, fee);
    assert.isAtLeast(makerAfter - makerBefore, price.toNumber() - fee);
    assert.strictEqual(rewards.amount.toString(), "1");
    await expectAssetOwner(asset, taker.publicKey);
  });

  it("buys an SPL-token-priced listing and splits tokens", async () => {
    const market = await createMarketplace(500);
    const taker = anchor.web3.Keypair.generate();
    await fund(taker);

    const asset = await createCoreAsset(admin);
    const [listing] = deriveListing(asset);
    const price = new anchor.BN(4_000_000);
    const fee = 200_000;
    const { mint: paymentMint, ownerAta: takerPaymentAta } =
      await makePaymentMint(taker.publicKey, price.toNumber());
    const makerPaymentAta = paymentAta(paymentMint, admin);
    const treasuryPaymentAta = paymentAta(
      paymentMint,
      market.marketplace,
      true
    );
    const takerRewardsAta = rewardsAta(market.rewardsMint, taker.publicKey);

    await getOrCreateAssociatedTokenAccount(
      provider.connection,
      payer,
      paymentMint,
      admin,
      false,
      undefined,
      undefined,
      tokenProgram,
      associatedTokenProgram
    );

    await program.methods
      .listWithToken(price)
      .accounts({
        maker: admin,
        asset,
        collection: null,
        paymentMint,
        listing,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    const listingAccount = await program.account.listing.fetch(listing);
    assert.isTrue(listingAccount.paymentMint.equals(paymentMint));

    await program.methods
      .buyWithToken()
      .accounts({
        taker: taker.publicKey,
        maker: admin,
        asset,
        collection: null,
        marketplace: market.marketplace,
        listing,
        paymentMint,
        takerPaymentAta,
        makerPaymentAta,
        treasuryPaymentAta,
        rewardsMint: market.rewardsMint,
        takerRewardsAta,
        mplCoreProgram,
        associatedTokenProgram,
        systemProgram,
        tokenProgram,
      })
      .signers([taker])
      .rpc();

    const makerTokens = await getAccount(
      provider.connection,
      makerPaymentAta,
      undefined,
      tokenProgram
    );
    const treasuryTokens = await getAccount(
      provider.connection,
      treasuryPaymentAta,
      undefined,
      tokenProgram
    );

    assert.strictEqual(makerTokens.amount.toString(), String(3_800_000));
    assert.strictEqual(treasuryTokens.amount.toString(), String(fee));
    assert.isNull(await provider.connection.getAccountInfo(listing));
    await expectAssetOwner(asset, taker.publicKey);
  });

  it("escrows and cancels an offer", async () => {
    const asset = await createCoreAsset(admin);
    const price = new anchor.BN(1_000_000);
    const [offer, offerBump] = deriveOffer(asset, admin);

    await program.methods
      .makeOffer(price)
      .accounts({
        maker: admin,
        asset,
        offer,
        systemProgram,
      })
      .rpc();

    const offerAccount = await program.account.offer.fetch(offer);
    const escrowBalance = await provider.connection.getBalance(offer);

    assert.isTrue(offerAccount.maker.equals(admin));
    assert.isTrue(offerAccount.asset.equals(asset));
    assert.strictEqual(offerAccount.price.toString(), price.toString());
    assert.strictEqual(offerAccount.bump, offerBump);
    assert.isAtLeast(escrowBalance, price.toNumber());

    await program.methods
      .cancelOffer()
      .accounts({
        maker: admin,
        asset,
        offer,
      })
      .rpc();

    assert.isNull(await provider.connection.getAccountInfo(offer));
  });

  it("accepts an offer for a listed asset", async () => {
    const market = await createMarketplace(500);
    const buyer = anchor.web3.Keypair.generate();
    await fund(buyer);

    const asset = await createCoreAsset(admin);
    const [listing] = deriveListing(asset);
    const [offer] = deriveOffer(asset, buyer.publicKey);
    const price = new anchor.BN(3_000_000);
    const fee = 150_000;

    await program.methods
      .list(new anchor.BN(5_000_000))
      .accounts({
        maker: admin,
        asset,
        collection: null,
        listing,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    await program.methods
      .makeOffer(price)
      .accounts({
        maker: buyer.publicKey,
        asset,
        offer,
        systemProgram,
      })
      .signers([buyer])
      .rpc();

    const treasuryBefore = await provider.connection.getBalance(
      market.treasury
    );

    await program.methods
      .acceptOffer()
      .accounts({
        maker: admin,
        offerMaker: buyer.publicKey,
        asset,
        collection: null,
        marketplace: market.marketplace,
        listing,
        offer,
        treasury: market.treasury,
        mplCoreProgram,
        systemProgram,
      })
      .rpc();

    const treasuryAfter = await provider.connection.getBalance(market.treasury);
    assert.strictEqual(treasuryAfter - treasuryBefore, fee);
    assert.isNull(await provider.connection.getAccountInfo(listing));
    assert.isNull(await provider.connection.getAccountInfo(offer));
    await expectAssetOwner(asset, buyer.publicKey);
  });

  it("only lets the marketplace admin withdraw treasury fees", async () => {
    const market = await createMarketplace(500);
    const outsider = anchor.web3.Keypair.generate();
    const withdrawAmount = 123_456;
    await fund(outsider);

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: admin,
          toPubkey: market.treasury,
          lamports: withdrawAmount,
        })
      )
    );

    try {
      await program.methods
        .withdrawFee(new anchor.BN(1))
        .accounts({
          admin: outsider.publicKey,
          marketplace: market.marketplace,
          treasury: market.treasury,
          systemProgram,
        })
        .signers([outsider])
        .rpc();
      assert.fail("non-admin withdrawal should fail");
    } catch (error) {
      assert.include(String(error), "ConstraintHasOne");
    }

    const beforeTreasuryBalance = await provider.connection.getBalance(
      market.treasury
    );

    await program.methods
      .withdrawFee(new anchor.BN(withdrawAmount))
      .accounts({
        admin,
        marketplace: market.marketplace,
        treasury: market.treasury,
        systemProgram,
      })
      .rpc();

    const afterTreasuryBalance = await provider.connection.getBalance(
      market.treasury
    );

    assert.strictEqual(
      beforeTreasuryBalance - afterTreasuryBalance,
      withdrawAmount
    );
  });
});
