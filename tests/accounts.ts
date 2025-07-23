import { Program } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";
import { Prediction } from "../target/types/prediction";

export async function fetchConfigAcc(
  program: Program<Prediction>,
  configPda: PublicKey
) {
  return program.account.config.fetchNullable(configPda);
}

export async function fetchMarketAcc(
  program: Program<Prediction>,
  marketPda: PublicKey
) {
  return program.account.market.fetchNullable(marketPda);
}

export async function fetchPositionAcc(
  program: Program<Prediction>,
  positionPda: PublicKey
) {
  return program.account.position.fetchNullable(positionPda);
}
