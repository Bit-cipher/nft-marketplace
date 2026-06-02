use anchor_lang::{prelude::*, system_program};
use anchor_spl::token_interface::Mint;
use mpl_core::instructions::TransferV1CpiBuilder;
use mpl_core::programs::MPL_CORE_ID;

use crate::*;

#[derive(Accounts)]

pub struct List<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: validate during the cpi transfer by mpl-core
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: optional MPL Core collection account validated by the MPL Core transfer CPI when present.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    #[account(
        init,
        payer = maker,
        seeds = [b"listing", asset.key().as_ref()],
        bump,
        space = 8 + Listing::INIT_SPACE,
    )]
    pub listing: Account<'info, Listing>,

    /// CHECK: fixed to the MPL Core program id.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> List<'info> {
    pub fn create_listing(&mut self, price: u64, bumps: &ListBumps) -> Result<()> {
        self.create_listing_for_mint(price, system_program::ID, bumps)
    }

    pub fn create_token_listing(
        &mut self,
        price: u64,
        payment_mint: &InterfaceAccount<'info, Mint>,
        bumps: &ListBumps,
    ) -> Result<()> {
        self.create_listing_for_mint(price, payment_mint.key(), bumps)
    }

    fn create_listing_for_mint(
        &mut self,
        price: u64,
        payment_mint: Pubkey,
        bumps: &ListBumps,
    ) -> Result<()> {
        self.listing.set_inner(Listing {
            maker: self.maker.key(),
            asset: self.asset.key(),
            payment_mint,
            price,
            bump: bumps.listing,
        });

        TransferV1CpiBuilder::new(&self.mpl_core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(self.collection.as_ref().map(|c| c.as_ref()))
            .payer(&self.maker.to_account_info())
            .authority(Some(&self.maker.to_account_info()))
            .new_owner(&self.listing.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke()?;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct ListWithToken<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: validate during the cpi transfer by mpl-core
    #[account(mut)]
    pub asset: UncheckedAccount<'info>,

    /// CHECK: optional MPL Core collection account validated by the MPL Core transfer CPI when present.
    #[account(mut)]
    pub collection: Option<UncheckedAccount<'info>>,

    pub payment_mint: InterfaceAccount<'info, Mint>,

    #[account(
        init,
        payer = maker,
        seeds = [b"listing", asset.key().as_ref()],
        bump,
        space = 8 + Listing::INIT_SPACE,
    )]
    pub listing: Account<'info, Listing>,

    /// CHECK: fixed to the MPL Core program id.
    #[account(address = MPL_CORE_ID)]
    pub mpl_core_program: UncheckedAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> ListWithToken<'info> {
    pub fn create_listing(&mut self, price: u64, bumps: &ListWithTokenBumps) -> Result<()> {
        self.listing.set_inner(Listing {
            maker: self.maker.key(),
            asset: self.asset.key(),
            payment_mint: self.payment_mint.key(),
            price,
            bump: bumps.listing,
        });

        TransferV1CpiBuilder::new(&self.mpl_core_program.to_account_info())
            .asset(&self.asset.to_account_info())
            .collection(self.collection.as_ref().map(|c| c.as_ref()))
            .payer(&self.maker.to_account_info())
            .authority(Some(&self.maker.to_account_info()))
            .new_owner(&self.listing.to_account_info())
            .system_program(Some(&self.system_program.to_account_info()))
            .invoke()?;

        Ok(())
    }
}
