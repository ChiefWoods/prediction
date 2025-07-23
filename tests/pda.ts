import { PublicKey } from "@solana/web3.js";
import { PREDICTION_PROGRAM_ID } from "./constants";

function getInt64Buffer(value: number) {
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64LE(BigInt(value), 0);
  return buffer;
}

export function getConfigPda() {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("config")],
    PREDICTION_PROGRAM_ID
  )[0];
}

export function getMarketPda(priceUpdateV2: PublicKey, resolveTs: number) {
  return PublicKey.findProgramAddressSync(
    [
      Buffer.from("market"),
      priceUpdateV2.toBuffer(),
      getInt64Buffer(resolveTs),
    ],
    PREDICTION_PROGRAM_ID
  )[0];
}

export function getPositionPda(authority: PublicKey, marketPda: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("position"), authority.toBuffer(), marketPda.toBuffer()],
    PREDICTION_PROGRAM_ID
  )[0];
}
