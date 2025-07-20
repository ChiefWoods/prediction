use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Config {
    pub authority: Pubkey,
    pub fee_bps: u16,
    pub mint: Pubkey,
    pub bump: u8,
}
