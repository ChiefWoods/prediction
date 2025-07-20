use anchor_lang::prelude::*;
use anchor_spl::{
    associated_token::AssociatedToken,
    token_interface::{Mint, TokenAccount, TokenInterface},
};

use crate::{error::PredictionError, Config, CONFIG_SEED, ONE_IN_BASIS_POINTS};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitializeConfigArgs {
    pub fee_bps: u16,
}

#[derive(Accounts)]
pub struct InitializeConfig<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        init,
        payer = authority,
        space = Config::DISCRIMINATOR.len() + Config::INIT_SPACE,
        seeds = [CONFIG_SEED],
        bump,
    )]
    pub config: Account<'info, Config>,
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = mint,
        associated_token::authority = config,
        associated_token::token_program = token_program,
    )]
    pub config_authority_token_account: InterfaceAccount<'info, TokenAccount>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

impl InitializeConfig<'_> {
    pub fn handler(ctx: Context<InitializeConfig>, args: InitializeConfigArgs) -> Result<()> {
        let InitializeConfigArgs { fee_bps } = args;

        require!(
            fee_bps <= ONE_IN_BASIS_POINTS,
            PredictionError::InvalidFeeBps
        );

        ctx.accounts.config.set_inner(Config {
            authority: ctx.accounts.authority.key(),
            fee_bps,
            mint: ctx.accounts.mint.key(),
            bump: ctx.bumps.config,
        });

        Ok(())
    }
}
