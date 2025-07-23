import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair } from "@solana/web3.js";
import {
  expectAnchorError,
  forwardTime,
  fundedSystemAccountInfo,
  getSetup,
  initUsdcAta,
} from "../setup";
import { getConfigPda, getMarketPda, getPositionPda } from "../pda";
import { fetchMarketAcc } from "../accounts";
import {
  SOL_USD_PRICE_UPDATE_V2,
  USDC_MINT,
  USDC_MINT_DECIMALS,
} from "../constants";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

describe("settleMarket", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Prediction>;
  };

  const [configAuthority, positionAuthority] = Array.from({ length: 2 }, () =>
    Keypair.generate()
  );

  const initAtaBal = 100 * 10 ** USDC_MINT_DECIMALS;
  const marketOpenPeriod = 60 * 60 * 24; // 1 day
  const configPda = getConfigPda();

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      ...[configAuthority, positionAuthority].map((kp) => {
        return {
          pubkey: kp.publicKey,
          account: fundedSystemAccountInfo(),
        };
      }),
    ]));

    initUsdcAta(litesvm, positionAuthority.publicKey, initAtaBal);

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

    const sharesToBuy = 10;

    await program.methods
      .tradeShares({
        shares: new BN(sharesToBuy),
        isBuy: true,
        isPass: true,
      })
      .accountsPartial({
        authority: positionAuthority.publicKey,
        configAuthority: configAuthority.publicKey,
        market: marketPda,
        position: positionPda,
        tradingMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([positionAuthority])
      .rpc();
  });

  test("settle a market", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );

    forwardTime(litesvm, marketOpenPeriod + 60); // forward time by marketOpenPeriod + 1 minute

    await program.methods
      .settleMarket()
      .accountsPartial({
        authority: configAuthority.publicKey,
        market: marketPda,
        priceUpdateV2: SOL_USD_PRICE_UPDATE_V2,
      })
      .signers([configAuthority])
      .rpc();

    const marketAcc = await fetchMarketAcc(program, marketPda);

    expect(marketAcc.state).toEqual({ passed: {} });
  });

  test("throws if market is already settled", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );

    forwardTime(litesvm, marketOpenPeriod + 60); // forward time by marketOpenPeriod + 1 minute

    await program.methods
      .settleMarket()
      .accountsPartial({
        authority: configAuthority.publicKey,
        market: marketPda,
        priceUpdateV2: SOL_USD_PRICE_UPDATE_V2,
      })
      .signers([configAuthority])
      .rpc();

    forwardTime(litesvm, marketOpenPeriod + 60); // forward time by marketOpenPeriod + 1 minute

    try {
      const ix = await program.methods
        .settleMarket()
        .accountsPartial({
          authority: configAuthority.publicKey,
          market: marketPda,
          priceUpdateV2: SOL_USD_PRICE_UPDATE_V2,
        })
        .signers([configAuthority])
        .rpc();
    } catch (err) {
      expectAnchorError(err, "MarketAlreadySettled");
    }
  });

  test("throws if market cannot be resolved yet", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );

    forwardTime(litesvm, marketOpenPeriod - 1); // forward time by marketOpenPeriod - 1 second

    try {
      await program.methods
        .settleMarket()
        .accountsPartial({
          authority: configAuthority.publicKey,
          market: marketPda,
          priceUpdateV2: SOL_USD_PRICE_UPDATE_V2,
        })
        .signers([configAuthority])
        .rpc();
    } catch (err) {
      expectAnchorError(err, "MarketCannotResolve");
    }
  });
});
