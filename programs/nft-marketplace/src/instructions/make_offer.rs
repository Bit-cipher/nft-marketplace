use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::*;

#[derive(Accounts)]

pub struct MakeOffer<'info> {
    #[account(mut)]
    pub maker: Signer<'info>,

    /// CHECK: used only as an address seed and stored on the offer account.
    pub asset: UncheckedAccount<'info>,

    #[account(
        init,
        payer = maker,
        seeds = [b"offer", asset.key().as_ref(), maker.key().as_ref()],
        bump,
        space = 8 + Offer::INIT_SPACE,
    )]
    pub offer: Account<'info, Offer>,

    pub system_program: Program<'info, System>,
}

impl<'info> MakeOffer<'info> {
    pub fn make_offer(&mut self, price: u64, bumps: &MakeOfferBumps) -> Result<()> {
        self.offer.set_inner(Offer {
            maker: self.maker.key(),
            asset: self.asset.key(),
            price,
            bump: bumps.offer,
        });

        transfer(
            CpiContext::new(
                self.system_program.to_account_info(),
                Transfer {
                    from: self.maker.to_account_info(),
                    to: self.offer.to_account_info(),
                },
            ),
            price,
        )?;

        Ok(())
    }
}
