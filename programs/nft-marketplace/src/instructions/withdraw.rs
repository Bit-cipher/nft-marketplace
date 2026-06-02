use anchor_lang::prelude::*;

use crate::*;

#[derive(Accounts)]

pub struct Withdraw<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: constrained by the listing PDA seeds and stored listing asset.
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        close = maker,
        seeds = [b"offer", maker.key().as_ref(), asset.key().as_ref()],
        bump = offer.bump,
        has_one = maker,
        has_one = asset,
    )]
    pub offer: Account<'info, Offer>,
}

impl<'info> Withdraw<'info> {
    pub fn withdraw(&mut self) -> Result<()> {
        Ok(())
    }
}