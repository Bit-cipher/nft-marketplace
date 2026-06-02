use anchor_lang::{
    prelude::*,
    system_program::{transfer, Transfer},
};

use crate::*;

#[derive(Accounts)]

pub struct WithdrawFee<'info> {
    #[account(mut)]
    pub admin: Signer<'info>,

    #[account(
        seeds = [b"marketplace", marketplace.name.as_str().as_bytes()],
        bump = marketplace.bump,
        has_one = admin,
    )]
    pub marketplace: Account<'info, Marketplace>,

    #[account(
        mut,
        seeds = [b"treasury", marketplace.key().as_ref()],
        bump = marketplace.treasury_bump,
    )]
    pub treasury: SystemAccount<'info>,

    pub system_program: Program<'info, System>,
}

impl<'info> WithdrawFee<'info> {
    pub fn withdraw_fee(&mut self, amount: u64) -> Result<()> {
        require!(
            self.treasury.to_account_info().lamports() >= amount,
            crate::errors::ErrorCode::InsufficientEscrowBalance
        );

        let marketplace_key = self.marketplace.key();
        let seeds: &[&[u8]] = &[
            b"treasury",
            marketplace_key.as_ref(),
            &[self.marketplace.treasury_bump],
        ];
        let signer_seeds = &[seeds];

        transfer(
            CpiContext::new_with_signer(
                self.system_program.to_account_info(),
                Transfer {
                    from: self.treasury.to_account_info(),
                    to: self.admin.to_account_info(),
                },
                signer_seeds,
            ),
            amount,
        )?;

        Ok(())
    }
}
