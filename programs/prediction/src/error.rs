use anchor_lang::prelude::*;

#[error_code]
pub enum PredictionError {
    #[msg("Fee bps must be between 0 and 10000")]
    InvalidFeeBps,
    #[msg("Authority does not match the one in config")]
    InvalidConfigAuthority,
    #[msg("Authority does not match the one in position")]
    InvalidPositionAuthority,
    #[msg("Market does not match the one in position")]
    InvalidMarket,
    #[msg("Price update v2 does not match the one in market")]
    InvalidPriceUpdateV2,
    #[msg("Mint does not match the one on config")]
    InvalidTradingMint,
    #[msg("Mint does not match the one on market")]
    InvalidPredictionMint,
    #[msg("Trade shares must be at least one")]
    InvalidTradeShares,
    #[msg("Selling more shares than available in position")]
    InsufficientSharesToSell,
    #[msg("Market can no only be traded")]
    MarketResolved,
    #[msg("Market has not crossed the resolve timestamp")]
    MarketCannotResolve,
    #[msg("Market is already settled")]
    MarketAlreadySettled,
    #[msg("Market state must be passed or failed")]
    MarketNotSettled,
    #[msg("Position has no winning shares in market")]
    NoClaimableWinnings,
    CustomError,
}
