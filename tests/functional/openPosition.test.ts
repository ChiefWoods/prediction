import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair } from "@solana/web3.js";
import { fundedSystemAccountInfo, getSetup } from "../setup";
import { getMarketPda, getPositionPda } from "../pda";
import { fetchPositionAcc } from "../accounts";
import { SOL_USD_PRICE_UPDATE_V2, USDC_MINT } from "../constants";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("openPosition", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Prediction>;
  };

  const [configAuthority, positionAuthority] = Array.from({ length: 2 }, () =>
    Keypair.generate()
  );

  const marketOpenPeriod = 60 * 60 * 24; // 1 day

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      ...[configAuthority, positionAuthority].map((kp) => {
        return {
          pubkey: kp.publicKey,
          account: fundedSystemAccountInfo(),
        };
      }),
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

    const now = litesvm.getClock().unixTimestamp;
    const resolveTs = Number(now) + marketOpenPeriod;

    await program.methods
      .createMarket({
        resolveTs: new BN(resolveTs),
        targetPrice: 150,
        title: "Will SOL reach $150 in 24 hours?",
      })
      .accountsPartial({
        authority: configAuthority.publicKey,
        priceUpdateV2: SOL_USD_PRICE_UPDATE_V2,
        tokenProgram: TOKEN_PROGRAM_ID,
        tradingMint: USDC_MINT,
      })
      .signers([configAuthority])
      .rpc();
  });

  test("open a position", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const resolveTs = Number(now) + marketOpenPeriod;

    const marketPda = getMarketPda(SOL_USD_PRICE_UPDATE_V2, resolveTs);

    await program.methods
      .openPosition()
      .accountsPartial({
        authority: positionAuthority.publicKey,
        market: marketPda,
      })
      .signers([positionAuthority])
      .rpc();

    const positionPda = getPositionPda(positionAuthority.publicKey, marketPda);
    const positionAcc = await fetchPositionAcc(program, positionPda);

    expect(positionAcc.authority).toStrictEqual(positionAuthority.publicKey);
    expect(positionAcc.market).toStrictEqual(marketPda);
  });
});
