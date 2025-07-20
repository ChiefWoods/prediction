use anchor_lang::prelude::*;

#[account]
#[derive(InitSpace)]
pub struct Position {
    pub authority: Pubkey,
    pub market: Pubkey,
    pub pass_shares: u64,
    pub fail_shares: u64,
    pub bump: u8,
}
