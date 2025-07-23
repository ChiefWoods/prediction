import { PublicKey } from "@solana/web3.js";
import idl from "../target/idl/prediction.json";

export const PREDICTION_PROGRAM_ID = new PublicKey(idl.address);
export const PYTH_SOLANA_RECEIVER_PROGRAM_ID = new PublicKey(
  "rec5EKMGg6MxZYaMdyBfgwp4d5rB9T1VQH5pJv5LtFJ"
);
export const SOL_USD_PRICE_UPDATE_V2 = new PublicKey(
  "7UVimffxr9ow1uXYxsr4LHAcV58mLzhmwaeKvJ1pjLiE"
);
export const USDC_MINT = PublicKey.unique();
export const USDC_MINT_DECIMALS = 6;
