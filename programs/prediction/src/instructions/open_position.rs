use anchor_lang::prelude::*;

use crate::{Market, Position, MARKET_SEED, POSITION_SEED};

#[derive(Accounts)]
pub struct OpenPosition<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.price_update_v2.key().as_ref(), market.resolve_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        init,
        payer = authority,
        space = Position::DISCRIMINATOR.len() + Position::INIT_SPACE,
        seeds = [POSITION_SEED, authority.key().as_ref(), market.key().as_ref()],
        bump,
    )]
    pub position: Account<'info, Position>,
    pub system_program: Program<'info, System>,
}

impl OpenPosition<'_> {
    pub fn handler(ctx: Context<OpenPosition>) -> Result<()> {
        ctx.accounts.position.set_inner(Position {
            authority: ctx.accounts.authority.key(),
            market: ctx.accounts.market.key(),
            pass_shares: 0,
            fail_shares: 0,
            bump: ctx.bumps.position,
        });

        Ok(())
    }
}
