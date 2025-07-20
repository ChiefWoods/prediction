use anchor_lang::prelude::*;
use num_derive::{FromPrimitive, ToPrimitive};

#[account]
pub struct Market {
    pub resolve_ts: i64,         // 8
    pub pass_shares: u64,        // 8
    pub fail_shares: u64,        // 8
    pub state: MarketState,      // 1
    pub price_update_v2: Pubkey, // 32
    pub target_price: f64,       // 8
    pub bump: u8,                // 1
    pub title: String,           // 4
}

impl Market {
    pub fn space(title: String) -> usize {
        return Market::DISCRIMINATOR.len() + 8 + 8 + 8 + 1 + 32 + 8 + 1 + 4 + title.len();
    }
}

#[derive(
    AnchorSerialize,
    AnchorDeserialize,
    FromPrimitive,
    ToPrimitive,
    Copy,
    Clone,
    PartialEq,
    Eq,
    InitSpace,
)]
pub enum MarketState {
    Initialized,
    Passed,
    Failed,
    Undecided,
}
