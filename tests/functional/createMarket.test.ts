import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair } from "@solana/web3.js";
import { fundedSystemAccountInfo, getSetup } from "../setup";
import { getMarketPda } from "../pda";
import { fetchMarketAcc } from "../accounts";
import { SOL_USD_PRICE_UPDATE_V2, USDC_MINT } from "../constants";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("createMarket", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Prediction>;
  };

  const configAuthority = Keypair.generate();

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      {
        pubkey: configAuthority.publicKey,
        account: fundedSystemAccountInfo(),
      },
    ]));

    await program.methods
      .initializeConfig({
        feeBps: 10,
      })
      .accounts({
        authority: configAuthority.publicKey,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([configAuthority])
      .rpc();
  });

  test("creates a market", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const resolveTs = Number(now) + 60 * 60 * 24; // 1 day from now
    const targetPrice = 150;
    const priceUpdateV2 = SOL_USD_PRICE_UPDATE_V2;

    await program.methods
      .createMarket({
        resolveTs: new BN(resolveTs),
        targetPrice,
        title: "Will SOL reach $150 in 24 hours?",
      })
      .accountsPartial({
        authority: configAuthority.publicKey,
        priceUpdateV2,
        tokenProgram: TOKEN_PROGRAM_ID,
        tradingMint: USDC_MINT,
      })
      .signers([configAuthority])
      .rpc();

    const marketPda = getMarketPda(priceUpdateV2, resolveTs);
    const marketAcc = await fetchMarketAcc(program, marketPda);

    expect(marketAcc.resolveTs.toNumber()).toBe(resolveTs);
    expect(marketAcc.priceUpdateV2).toStrictEqual(priceUpdateV2);
    expect(marketAcc.targetPrice).toBe(targetPrice);

    const marketAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      marketPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const marketAtaAcc = litesvm.getAccount(marketAta);

    expect(marketAtaAcc).not.toBeNull();
  });
});
