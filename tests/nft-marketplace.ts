import * as anchor from "@coral-xyz/anchor";
import { Program } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { assert } from "chai";
import { NftMarketplace } from "../target/types/nft_marketplace";

describe("nft-marketplace", () => {
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.nftMarketplace as Program<NftMarketplace>;
  const admin = provider.wallet.publicKey;
  const systemProgram = anchor.web3.SystemProgram.programId;

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

  const deriveOffer = (
    maker: anchor.web3.PublicKey,
    asset: anchor.web3.PublicKey
  ) =>
    anchor.web3.PublicKey.findProgramAddressSync(
      [Buffer.from("offer"), maker.toBuffer(), asset.toBuffer()],
      program.programId
    );

  const uniqueName = (prefix: string) =>
    `${prefix}-${Date.now().toString(36).slice(-8)}`;

  it("initializes marketplace PDAs with the expected state", async () => {
    const name = uniqueName("market");
    const fee = 250;
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
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    const marketplaceAccount = await program.account.marketplace.fetch(
      marketplace
    );
    const treasuryAccount = await provider.connection.getAccountInfo(treasury);
    const rewardsMintAccount = await provider.connection.getAccountInfo(
      rewardsMint
    );

    assert.strictEqual(marketplaceAccount.name, name);
    assert.strictEqual(marketplaceAccount.fee, fee);
    assert.strictEqual(marketplaceAccount.bump, marketplaceBump);
    assert.strictEqual(marketplaceAccount.treasuryBump, treasuryBump);
    assert.strictEqual(marketplaceAccount.rewardsBump, rewardsBump);
    assert.isTrue(marketplaceAccount.admin.equals(admin));
    assert.isTrue(treasuryAccount?.owner.equals(systemProgram));
    assert.isTrue(rewardsMintAccount?.owner.equals(TOKEN_PROGRAM_ID));
  });

  it("escrows an offer and returns the escrow when withdrawn", async () => {
    const asset = anchor.web3.Keypair.generate().publicKey;
    const price = new anchor.BN(1_000_000);
    const [offer, offerBump] = deriveOffer(admin, asset);

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
      .withdraw()
      .accounts({
        maker: admin,
        asset,
        offer,
      })
      .rpc();

    const closedOffer = await provider.connection.getAccountInfo(offer);
    assert.isNull(closedOffer);
  });

  it("only lets the marketplace admin withdraw treasury fees", async () => {
    const name = uniqueName("fees");
    const fee = 500;
    const withdrawAmount = 123_456;
    const outsider = anchor.web3.Keypair.generate();
    const [marketplace] = deriveMarketplace(name);
    const [treasury] = deriveTreasury(marketplace);
    const [rewardsMint] = deriveRewardsMint(marketplace);

    await program.methods
      .initialize(name, fee)
      .accounts({
        admin,
        marketplace,
        treasury,
        rewardsMint,
        systemProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .rpc();

    await provider.sendAndConfirm(
      new anchor.web3.Transaction().add(
        anchor.web3.SystemProgram.transfer({
          fromPubkey: admin,
          toPubkey: treasury,
          lamports: withdrawAmount,
        })
      )
    );

    try {
      await program.methods
        .withdrawFee(new anchor.BN(1))
        .accounts({
          admin: outsider.publicKey,
          marketplace,
          treasury,
          systemProgram,
        })
        .signers([outsider])
        .rpc();
      assert.fail("non-admin withdrawal should fail");
    } catch (error) {
      assert.include(String(error), "ConstraintHasOne");
    }

    const beforeAdminBalance = await provider.connection.getBalance(admin);
    const beforeTreasuryBalance = await provider.connection.getBalance(treasury);

    await program.methods
      .withdrawFee(new anchor.BN(withdrawAmount))
      .accounts({
        admin,
        marketplace,
        treasury,
        systemProgram,
      })
      .rpc();

    const afterAdminBalance = await provider.connection.getBalance(admin);
    const afterTreasuryBalance = await provider.connection.getBalance(treasury);

    assert.strictEqual(
      beforeTreasuryBalance - afterTreasuryBalance,
      withdrawAmount
    );
    assert.isAbove(afterAdminBalance, beforeAdminBalance);
  });
});
