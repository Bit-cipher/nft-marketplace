use anchor_lang::prelude::*;
use mpl_core::instructions::TransferV1CpiBuilder;
use mpl_core::programs::MPL_CORE_ID;

use crate::*;

#[derive(Accounts)]

pub struct Delist<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: validate during the cpi transfer by mpl-core
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: optional MPL Core collection account validated by the MPL Core transfer CPI when present.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    #[account(
        mut,
        close = maker,
        seeds = [b"listing", asset.key().as_ref()],
        bump = listing.bump,
        has_one = maker,
        has_one = asset,
    )]
    pub listing: Account<'info, Listing>,

    /// CHECK: fixed to the MPL Core program id.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> Delist<'info> {
    pub fn delist(&mut self) -> Result<()> {
        let asset_key = self.asset.key();
        let bump = self.listing.bump;
        let seeds: &[&[u8]] = &[b"listing", asset_key.as_ref(), &[bump]];
        let signer_seeds = &[seeds];

        TransferV1CpiBuilder::new(&self.mpl_core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(self.collection.as_ref().map(|c| c.as_ref()))
            .payer(&self.maker.to_account_info())
            .authority(Some(&self.listing.to_account_info()))
            .new_owner(&self.maker.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke_signed(signer_seeds)?;

        Ok(())
    }
}