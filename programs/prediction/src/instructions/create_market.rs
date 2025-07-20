use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};
use pyth_solana_receiver_sdk::price_update::PriceUpdateV2;

use crate::{error::PredictionError, Config, Market, MarketState, CONFIG_SEED, MARKET_SEED};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct CreateMarketArgs {
    pub resolve_ts: i64,
    pub target_price: f64,
    pub title: String,
}

#[derive(Accounts)]
#[instruction(args: CreateMarketArgs)]
pub struct CreateMarket<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ PredictionError::InvalidConfigAuthority,
        constraint = config.mint == trading_mint.key() @ PredictionError::InvalidTradingMint,
    )]
    pub config: Account<'info, Config>,
    #[account(
        init,
        payer = authority,
        space = Market::space(args.title),
        seeds = [MARKET_SEED, price_update_v2.key().as_ref(), args.resolve_ts.to_le_bytes().as_ref()],
        bump,
    )]
    pub market: Account<'info, Market>,
    pub price_update_v2: Account<'info, PriceUpdateV2>,
    pub trading_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = trading_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub market_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl CreateMarket<'_> {
    pub fn handler(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        let CreateMarketArgs {
            resolve_ts,
            target_price,
            title,
        } = args;

        ctx.accounts.market.set_inner(Market {
            resolve_ts,
            pass_shares: 0,
            fail_shares: 0,
            state: MarketState::Initialized,
            price_update_v2: ctx.accounts.price_update_v2.key(),
            target_price,
            bump: ctx.bumps.market,
            title,
        });

        Ok(())
    }
}
