use anchor_lang::prelude::*;

use crate::*;

#[derive(Accounts)]
pub struct CancelOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: constrained by the offer PDA seeds and stored offer asset.
    pub asset: UncheckedAccount<'info>,

    #[account(
        mut,
        close = maker,
        seeds = [b"offer", asset.key().as_ref(), maker.key().as_ref()],
        bump = offer.bump,
        has_one = maker,
        has_one = asset,
    )]
    pub offer: Account<'info, Offer>,
}

impl<'info> CancelOffer<'info> {
    pub fn cancel_offer(&mut self) -> Result<()> {
        Ok(())
    }
}
