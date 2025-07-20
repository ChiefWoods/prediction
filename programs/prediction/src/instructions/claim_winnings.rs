use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    error::PredictionError, imprecise_number, market_signer, precise_number, Market, MarketState,
    Position, MARKET_SEED,
};

#[derive(Accounts)]
pub struct ClaimWinnings<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        seeds = [MARKET_SEED, market.price_update_v2.key().as_ref(), market.resolve_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
        close = authority,
        has_one = authority @ PredictionError::InvalidPositionAuthority,
        has_one = market @ PredictionError::InvalidMarket,
    )]
    pub position: Account<'info, Position>,
    pub trading_mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = trading_mint,
        associated_token::authority = authority,
        associated_token::token_program = token_program,
    )]
    pub authority_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = trading_mint,
        associated_token::authority = market,
        associated_token::token_program = token_program,
    )]
    pub market_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl ClaimWinnings<'_> {
    pub fn handler(ctx: Context<ClaimWinnings>) -> Result<()> {
        let market = &ctx.accounts.market;

        require!(
            ctx.accounts.market.state == MarketState::Passed
                || ctx.accounts.market.state == MarketState::Failed,
            PredictionError::MarketNotSettled
        );

        let position = &ctx.accounts.position;

        let (winning_position_shares, winning_market_shares) =
            if market.state == MarketState::Passed {
                (position.pass_shares, market.pass_shares)
            } else {
                (position.fail_shares, market.fail_shares)
            };

        require!(
            winning_position_shares > 0,
            PredictionError::NoClaimableWinnings
        );

        let pct_of_pot_claimable = precise_number!(winning_position_shares.into())
            .checked_div(&precise_number!(winning_market_shares.into()))
            .unwrap();

        let amount = imprecise_number!(pct_of_pot_claimable
            .checked_mul(&precise_number!(ctx
                .accounts
                .market_token_account
                .amount
                .into()))
            .unwrap()
            .floor()
            .unwrap()) as u64;

        let price_update_v2_key = ctx.accounts.market.price_update_v2.key();
        let resolve_ts_bytes = market.resolve_ts.to_le_bytes();
        let signer_seeds: &[&[u8]] = market_signer!(
            price_update_v2_key.as_ref(),
            resolve_ts_bytes.as_ref(),
            market.bump
        );

        // return err!(PredictionError::CustomError);

        transfer_checked(
            CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    authority: ctx.accounts.market.to_account_info(),
                    from: ctx.accounts.market_token_account.to_account_info(),
                    mint: ctx.accounts.trading_mint.to_account_info(),
                    to: ctx.accounts.authority_token_account.to_account_info(),
                },
            )
            .with_signer(&[signer_seeds]),
            amount,
            ctx.accounts.trading_mint.decimals,
        )
    }
}
