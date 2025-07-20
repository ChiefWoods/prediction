use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_2022::{transfer_checked, TransferChecked},
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{
    error::PredictionError, market_signer, utils::calculate_price, Config, Market, Position,
    CONFIG_SEED, MARKET_SEED,
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct TradeSharesArgs {
    pub shares: u64,
    pub is_pass: bool,
    pub is_buy: bool,
}

#[derive(Accounts)]
pub struct TradeShares<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(mut)]
    pub config_authority: SystemAccount<'info>,
    #[account(
        seeds = [CONFIG_SEED],
        bump = config.bump,
        constraint = config.authority == config_authority.key() @ PredictionError::InvalidConfigAuthority,
    )]
    pub config: Account<'info, Config>,
    #[account(
        mut,
        seeds = [MARKET_SEED, market.price_update_v2.key().as_ref(), market.resolve_ts.to_le_bytes().as_ref()],
        bump = market.bump,
    )]
    pub market: Account<'info, Market>,
    #[account(
        mut,
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
    #[account(
        mut,
        associated_token::mint = trading_mint,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    pub config_authority_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl TradeShares<'_> {
    pub fn trade_shares(ctx: Context<TradeShares>, args: TradeSharesArgs) -> Result<()> {
        let TradeSharesArgs {
            shares,
            is_pass,
            is_buy,
        } = args;

        require!(shares > 0, PredictionError::InvalidTradeShares);

        let market = &mut ctx.accounts.market;
        let now = Clock::get()?.unix_timestamp;

        require!(now < market.resolve_ts, PredictionError::MarketResolved);

        let position = &mut ctx.accounts.position;

        if is_buy {
            if is_pass {
                position.pass_shares = position.pass_shares.checked_add(shares).unwrap();
                market.pass_shares = market.pass_shares.checked_add(shares).unwrap();
            } else {
                position.fail_shares = position.fail_shares.checked_add(shares).unwrap();
                market.fail_shares = market.fail_shares.checked_add(shares).unwrap();
            }
        } else {
            if is_pass {
                position.pass_shares = position
                    .pass_shares
                    .checked_sub(shares)
                    .ok_or(PredictionError::InsufficientSharesToSell)?;
                market.pass_shares = market
                    .pass_shares
                    .checked_sub(shares)
                    .ok_or(PredictionError::InsufficientSharesToSell)?;
            } else {
                position.fail_shares = position
                    .fail_shares
                    .checked_sub(shares)
                    .ok_or(PredictionError::InsufficientSharesToSell)?;
                market.fail_shares = market
                    .fail_shares
                    .checked_sub(shares)
                    .ok_or(PredictionError::InsufficientSharesToSell)?;
            }
        }

        let config = &ctx.accounts.config;
        let (fee, amount) = calculate_price(
            shares,
            market.pass_shares,
            market.fail_shares,
            is_pass,
            config.fee_bps,
        )?;

        let price_update_v2_key = market.price_update_v2.key();
        let resolve_ts_bytes = market.resolve_ts.to_le_bytes();
        let signer_seeds: &[&[&[u8]]] = &[market_signer!(
            price_update_v2_key.as_ref(),
            resolve_ts_bytes.as_ref(),
            market.bump
        )];

        let mint = ctx.accounts.trading_mint.to_account_info();
        let decimals = ctx.accounts.trading_mint.decimals;

        let (authority, from, to) = if is_buy {
            (
                ctx.accounts.authority.to_account_info(),
                ctx.accounts.authority_token_account.to_account_info(),
                ctx.accounts.market_token_account.to_account_info(),
            )
        } else {
            (
                market.to_account_info(),
                ctx.accounts.market_token_account.to_account_info(),
                ctx.accounts.authority_token_account.to_account_info(),
            )
        };

        {
            let mut cpi_context = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    authority: authority.clone(),
                    from: from.clone(),
                    mint: mint.to_account_info(),
                    to,
                },
            );

            if !is_buy {
                cpi_context = cpi_context.with_signer(signer_seeds);
            }

            transfer_checked(cpi_context, amount, decimals)?;
        }

        {
            let mut cpi_context = CpiContext::new(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    authority,
                    from,
                    mint: mint.to_account_info(),
                    to: ctx
                        .accounts
                        .config_authority_token_account
                        .to_account_info(),
                },
            );

            if !is_buy {
                cpi_context = cpi_context.with_signer(signer_seeds);
            }

            transfer_checked(cpi_context, fee, decimals)?;
        };

        Ok(())
    }
}
