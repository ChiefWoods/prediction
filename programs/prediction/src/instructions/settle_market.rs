use anchor_lang::prelude::*;
use pyth_solana_receiver_sdk::price_update::{FeedId, Price, PriceUpdateV2};
use spl_math::precise_number::PreciseNumber;

use crate::{
    error::PredictionError, imprecise_number, precise_number, Config, Market, MarketState,
    CONFIG_SEED, MARKET_SEED, RESOLVE_TS_WINDOW,
};

#[derive(Accounts)]
pub struct SettleMarket<'info> {
    pub authority: Signer<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        has_one = authority @ PredictionError::InvalidConfigAuthority,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_update_v2.key().as_ref(), market.resolve_ts.to_le_bytes().as_ref()],
        bump = market.bump,
        has_one = price_update_v2 @ PredictionError::InvalidPriceUpdateV2,
    )]
    pub market: Account<'info, Market>,
    pub price_update_v2: Account<'info, PriceUpdateV2>,
}

impl SettleMarket<'_> {
    pub fn handler(ctx: Context<SettleMarket>) -> Result<()> {
        let market = &mut ctx.accounts.market;

        require!(
            market.state == MarketState::Initialized,
            PredictionError::MarketAlreadySettled
        );

        let clock = Clock::get()?;
        let now = clock.unix_timestamp;

        require!(
            now >= market.resolve_ts,
            PredictionError::MarketCannotResolve
        );

        if now - market.resolve_ts <= RESOLVE_TS_WINDOW {
            let price_update_v2 = &ctx.accounts.price_update_v2;
            let feed_id: FeedId = price_update_v2.price_message.feed_id.into();
            let Price {
                price,
                exponent,
                conf: _,
                publish_time: _,
            } = price_update_v2
                .get_price_no_older_than(&clock, 60, &feed_id)
                .unwrap();

            let ops = if exponent < 0 {
                PreciseNumber::checked_div
            } else {
                PreciseNumber::checked_mul
            };

            let scaled = ops(
                &precise_number!(price as u128),
                &precise_number!(10_u64.pow(exponent.abs() as u32) as u128),
            )
            .unwrap();

            market.state = if !imprecise_number!(scaled) as f64 >= market.target_price {
                MarketState::Passed
            } else {
                MarketState::Failed
            }
        } else {
            market.state = MarketState::Undecided;
        }

        Ok(())
    }
}
