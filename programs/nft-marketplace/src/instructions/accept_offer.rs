use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;
use mpl_core::programs::MPL_CORE_ID;

use crate::*;

#[derive(Accounts)]

pub struct AcceptOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: constrained to `offer.maker` and receives the NFT after the offer is accepted.
    #[account(mut, address = offer.maker)]
    pub offer_maker: UncheckedAccount<'info>,

    /// CHECK: validate during the cpi transfer by mpl-core
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: optional MPL Core collection account validated by the MPL Core transfer CPI when present.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    #[account(
        seeds = [b"marketplace", marketplace.name.as_str().as_bytes()],
        bump = marketplace.bump,
    )]
    pub marketplace: Account<'info, Marketplace>,

    #[account(
        mut,
        close = maker,
        seeds = [b"listing", asset.key().as_ref()],
        bump = listing.bump,
        has_one = maker,
        has_one = asset,
    )]
    pub listing: Account<'info, Listing>,

    #[account(
        mut,
        close = maker,
        seeds = [b"offer", asset.key().as_ref(), offer_maker.key().as_ref()],
        bump = offer.bump,
        has_one = asset,
    )]
    pub offer: Account<'info, Offer>,

    #[account(
        mut,
        seeds = [b"treasury", marketplace.key().as_ref()],
        bump = marketplace.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    /// CHECK: fixed to the MPL Core program id.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> AcceptOffer<'info> {
    pub fn accept_offer(&mut self) -> Result<()> {
        self.send_sol()?;
        self.send_nft()
    }

    pub fn send_sol(&mut self) -> Result<()> {
        let price = self.offer.price;
        let fee = (price as u128)
            .checked_mul(self.marketplace.fee as u128)
            .ok_or(crate::errors::ErrorCode::MathOverflow)?
            .checked_div(10_000)
            .ok_or(crate::errors::ErrorCode::MathOverflow)? as u64;

        require!(
            self.offer.to_account_info().lamports() >= price,
            crate::errors::ErrorCode::InsufficientEscrowBalance
        );

        **self.offer.to_account_info().try_borrow_mut_lamports()? -= fee;
        **self.treasury.to_account_info().try_borrow_mut_lamports()? += fee;

        Ok(())
    }

    pub fn send_nft(&mut self) -> Result<()> {
        let asset_key = self.asset.key();
        let bump = self.listing.bump;
        let seeds: &[&[u8]] = &[b"listing", asset_key.as_ref(), &[bump]];
        let signer_seeds = &[seeds];

        TransferV1CpiBuilder::new(&self.mpl_core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(self.collection.as_ref().map(|c| c.as_ref()))
            .payer(&self.maker.to_account_info())
            .authority(Some(&self.listing.to_account_info()))
            .new_owner(&self.offer_maker.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}
