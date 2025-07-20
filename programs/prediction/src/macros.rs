#[macro_export]
macro_rules! market_signer {
    ($prediction_mint: expr, $resolve_ts: expr, $bump: expr) => {
        &[MARKET_SEED, $prediction_mint, $resolve_ts, &[$bump]]
    };
}

#[macro_export]
macro_rules! precise_number {
    ($value: expr) => {
        spl_math::precise_number::PreciseNumber::new($value).unwrap()
    };
}

#[macro_export]
macro_rules! imprecise_number {
    ($precise_number: expr) => {
        $precise_number.to_imprecise().unwrap()
    };
}
