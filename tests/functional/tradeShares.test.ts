import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair } from "@solana/web3.js";
import {
  expectAnchorError,
  fundedSystemAccountInfo,
  getSetup,
  initUsdcAta,
} from "../setup";
import { getConfigPda, getMarketPda, getPositionPda } from "../pda";
import { fetchConfigAcc, fetchPositionAcc } from "../accounts";
import {
  SOL_USD_PRICE_UPDATE_V2,
  USDC_MINT,
  USDC_MINT_DECIMALS,
} from "../constants";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  MAX_FEE_BASIS_POINTS,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("tradeShares", () => {
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
  });

  test("buy shares", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );
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

    const positionAcc = await fetchPositionAcc(program, positionPda);

    expect(positionAcc.passShares.toNumber()).toBe(sharesToBuy);

    const marketAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      marketPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const marketAtaAcc = await getAccount(
      provider.connection,
      marketAta,
      "processed"
    );
    const price = sharesToBuy * 10 ** USDC_MINT_DECIMALS;
    const configAcc = await fetchConfigAcc(program, configPda);
    const feeBps = configAcc.feeBps;
    const fee = price * (feeBps / MAX_FEE_BASIS_POINTS);

    expect(Number(marketAtaAcc.amount)).toBe(price - fee);

    const configAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      configPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const configAtaAcc = await getAccount(
      provider.connection,
      configAta,
      "processed"
    );

    expect(Number(configAtaAcc.amount)).toBe(fee);

    const positionAuthorityAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      positionAuthority.publicKey,
      true,
      TOKEN_PROGRAM_ID
    );
    const postPositionAuthorityAtaAcc = await getAccount(
      provider.connection,
      positionAuthorityAta,
      "processed"
    );
    const postPositionAuthorityAtaBal = postPositionAuthorityAtaAcc.amount;

    expect(initAtaBal).toBe(Number(postPositionAuthorityAtaBal) + price);
  });

  test("sell shares", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );
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

    const marketAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      marketPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const preMarketAtaAcc = await getAccount(
      provider.connection,
      marketAta,
      "processed"
    );

    const configAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      configPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const preConfigAtaAcc = await getAccount(
      provider.connection,
      configAta,
      "processed"
    );

    const positionAuthorityAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      positionAuthority.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const initPositionAuthorityAtaAcc = await getAccount(
      provider.connection,
      positionAuthorityAta,
      "processed"
    );
    const initPositionAuthorityAtaBal = initPositionAuthorityAtaAcc.amount;

    const sharesToSell = 5;

    await program.methods
      .tradeShares({
        shares: new BN(sharesToSell),
        isBuy: false,
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

    const positionAcc = await fetchPositionAcc(program, positionPda);

    expect(positionAcc.passShares.toNumber()).toBe(sharesToBuy - sharesToSell);

    const postMarketAtaAcc = await getAccount(
      provider.connection,
      marketAta,
      "processed"
    );
    const price = sharesToSell * 10 ** USDC_MINT_DECIMALS;

    const configAcc = await fetchConfigAcc(program, configPda);
    const feeBps = configAcc.feeBps;
    const fee = price * (feeBps / MAX_FEE_BASIS_POINTS);

    expect(Number(preMarketAtaAcc.amount)).toBe(
      Number(postMarketAtaAcc.amount) + price
    );

    const postConfigAtaAcc = await getAccount(
      provider.connection,
      configAta,
      "processed"
    );

    expect(Number(preConfigAtaAcc.amount)).toBe(
      Number(postConfigAtaAcc.amount) - fee
    );

    const postPositionAuthorityAtaAcc = await getAccount(
      provider.connection,
      positionAuthorityAta,
      "processed"
    );
    const postPositionAuthorityAtaBal = postPositionAuthorityAtaAcc.amount;

    expect(Number(initPositionAuthorityAtaBal)).toBe(
      Number(postPositionAuthorityAtaBal) - price + fee
    );
  });

  test("throws if there's not enough shares to sell", async () => {
    const now = litesvm.getClock().unixTimestamp;
    const marketPda = getMarketPda(
      SOL_USD_PRICE_UPDATE_V2,
      Number(now) + marketOpenPeriod
    );
    const positionPda = getPositionPda(positionAuthority.publicKey, marketPda);
    const positionAcc = await fetchPositionAcc(program, positionPda);

    const sharesToSell = positionAcc.passShares.addn(1);

    try {
      await program.methods
        .tradeShares({
          shares: sharesToSell,
          isBuy: false,
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
    } catch (err) {
      expectAnchorError(err, "InsufficientSharesToSell");
    }
  });
});
