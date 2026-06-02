pub mod constants;
pub mod errors;
pub mod instructions;
pub mod state;

use anchor_lang::prelude::*;

pub use constants::*;

pub use instructions::*;
pub use state::*;
declare_id!("CimhnELwkSV4Q4Dg41cFnqaqhxwkQ9LVxskW5uL1PpWJ");

#[program]
pub mod nft_marketplace {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>, name: String, fee: u16) -> Result<()> {
        ctx.accounts.init(name, fee, &ctx.bumps)
    }

    pub fn list(ctx: Context<List>, price: u64) -> Result<()> {
        ctx.accounts.create_listing(price, &ctx.bumps)
    }

    pub fn list_with_token(ctx: Context<ListWithToken>, price: u64) -> Result<()> {
        ctx.accounts.create_listing(price, &ctx.bumps)
    }

    pub fn buy(ctx: Context<Buy>) -> Result<()> {
        ctx.accounts.send_sol()?;
        ctx.accounts.receive_nft()?;
        ctx.accounts.receive_rewards()
    }

    pub fn buy_with_token(ctx: Context<BuyWithToken>) -> Result<()> {
        ctx.accounts.send_tokens()?;
        ctx.accounts.receive_nft()?;
        ctx.accounts.receive_rewards()
    }

    pub fn delist(ctx: Context<Delist>) -> Result<()> {
        ctx.accounts.delist()
    }

    pub fn make_offer(ctx: Context<MakeOffer>, price: u64) -> Result<()> {
        ctx.accounts.make_offer(price, &ctx.bumps)
    }

    pub fn accept_offer(ctx: Context<AcceptOffer>) -> Result<()> {
        ctx.accounts.accept_offer()
    }

    pub fn cancel_offer(ctx: Context<CancelOffer>) -> Result<()> {
        ctx.accounts.cancel_offer()
    }

    pub fn withdraw_fee(ctx: Context<WithdrawFee>, amount: u64) -> Result<()> {
        ctx.accounts.withdraw_fee(amount)
    }
}
