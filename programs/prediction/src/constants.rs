use anchor_lang::prelude::*;

#[constant]
pub const CONFIG_SEED: &[u8] = b"config";
pub const MARKET_SEED: &[u8] = b"market";
pub const POSITION_SEED: &[u8] = b"position";
pub const ONE_IN_BASIS_POINTS: u16 = 10_000;
pub const RESOLVE_TS_WINDOW: i64 = 15 * 60; // 15 minutes
pub const BASE_SHARE_PRICE: u32 = 1_000_000; // 1 USDC
