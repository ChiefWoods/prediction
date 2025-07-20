use anchor_lang::prelude::*;

use crate::{imprecise_number, precise_number, BASE_SHARE_PRICE, ONE_IN_BASIS_POINTS};

pub fn calculate_price(
    shares: u64,
    pass_shares: u64,
    fail_shares: u64,
    is_pass: bool,
    fee_bps: u16,
) -> Result<(u64, u64)> {
    let mut total_price = precise_number!((BASE_SHARE_PRICE as u64)
        .checked_mul(shares)
        .unwrap()
        .into());

    if pass_shares != 0 && fail_shares != 0 {
        let total_shares = pass_shares.checked_add(fail_shares).unwrap();
        let pass_ratio = precise_number!(pass_shares.into())
            .checked_div(&precise_number!(total_shares.into()))
            .unwrap();

        let ratio = if is_pass {
            pass_ratio
        } else {
            precise_number!(1).checked_sub(&pass_ratio).unwrap()
        };

        let one_half = precise_number!(1).checked_div(&precise_number!(2)).unwrap();

        let imbalance = ratio.checked_sub(&one_half).unwrap();
        let multiplier_adjustment = imbalance.checked_mul(&precise_number!(2)).unwrap();
        let price_multiplier = precise_number!(1)
            .checked_add(&multiplier_adjustment)
            .unwrap();
        total_price = total_price.checked_mul(&price_multiplier).unwrap();
    }

    let fee_multiplier = precise_number!(fee_bps.into())
        .checked_div(&precise_number!(ONE_IN_BASIS_POINTS.into()))
        .unwrap();

    let fee = total_price
        .checked_mul(&fee_multiplier)
        .unwrap()
        .floor()
        .unwrap();

    let price = total_price.checked_sub(&fee).unwrap().floor().unwrap();

    Ok((
        imprecise_number!(fee) as u64,
        imprecise_number!(price) as u64,
    ))
}
