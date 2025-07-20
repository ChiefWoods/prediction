pub mod constants;
pub mod error;
pub mod instructions;
pub mod macros;
pub mod state;
pub mod utils;

use anchor_lang::prelude::*;

pub use constants::*;
pub use instructions::*;
pub use state::*;

declare_id!("9rkSYrW7SicS18G1z18G4u8gHA5CL8TkBSxb7vAnZwtL");

#[program]
pub mod prediction {
    use super::*;

    pub fn initialize_config(
        ctx: Context<InitializeConfig>,
        args: InitializeConfigArgs,
    ) -> Result<()> {
        InitializeConfig::handler(ctx, args)
    }

    pub fn create_market(ctx: Context<CreateMarket>, args: CreateMarketArgs) -> Result<()> {
        CreateMarket::handler(ctx, args)
    }

    pub fn open_position(ctx: Context<OpenPosition>) -> Result<()> {
        OpenPosition::handler(ctx)
    }

    pub fn trade_shares(ctx: Context<TradeShares>, args: TradeSharesArgs) -> Result<()> {
        TradeShares::trade_shares(ctx, args)
    }

    pub fn settle_market(ctx: Context<SettleMarket>) -> Result<()> {
        SettleMarket::handler(ctx)
    }

    pub fn claim_winnings(ctx: Context<ClaimWinnings>) -> Result<()> {
        ClaimWinnings::handler(ctx)
    }
}
