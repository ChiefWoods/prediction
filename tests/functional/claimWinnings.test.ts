import { BN, Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  expectAnchorError,
  forwardTime,
  fundedSystemAccountInfo,
  getSetup,
  initUsdcAta,
} from "../setup";
import { getConfigPda, getMarketPda, getPositionPda } from "../pda";
import {
  SOL_USD_PRICE_UPDATE_V2,
  USDC_MINT,
  USDC_MINT_DECIMALS,
} from "../constants";
import {
  getAccount,
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("claimWinnings", () => {
  let { litesvm, provider, program } = {} as {
    litesvm: LiteSVM;
    provider: LiteSVMProvider;
    program: Program<Prediction>;
  };

  const [configAuthority, passPositionAuthority, failPositionAuthority] =
    Array.from({ length: 3 }, () => Keypair.generate());

  const initAtaBal = 100 * 10 ** USDC_MINT_DECIMALS;
  const marketOpenPeriod = 60 * 60 * 24; // 1 day
  const configPda = getConfigPda();
  let marketPda: PublicKey;

  beforeEach(async () => {
    ({ litesvm, provider, program } = await getSetup([
      ...[configAuthority, passPositionAuthority, failPositionAuthority].map(
        (kp) => {
          return {
            pubkey: kp.publicKey,
            account: fundedSystemAccountInfo(),
          };
        }
      ),
    ]));

    initUsdcAta(litesvm, passPositionAuthority.publicKey, initAtaBal);
    initUsdcAta(litesvm, failPositionAuthority.publicKey, initAtaBal);

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

    marketPda = getMarketPda(SOL_USD_PRICE_UPDATE_V2, resolveTs);

    await program.methods
      .openPosition()
      .accountsPartial({
        authority: passPositionAuthority.publicKey,
        market: marketPda,
      })
      .signers([passPositionAuthority])
      .rpc();

    const sharesToBuy = 10;

    await program.methods
      .tradeShares({
        shares: new BN(sharesToBuy),
        isBuy: true,
        isPass: true,
      })
      .accountsPartial({
        authority: passPositionAuthority.publicKey,
        configAuthority: configAuthority.publicKey,
        market: marketPda,
        position: getPositionPda(passPositionAuthority.publicKey, marketPda),
        tradingMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([passPositionAuthority])
      .rpc();

    await program.methods
      .openPosition()
      .accountsPartial({
        authority: failPositionAuthority.publicKey,
        market: marketPda,
      })
      .signers([failPositionAuthority])
      .rpc();

    await program.methods
      .tradeShares({
        shares: new BN(sharesToBuy),
        isBuy: true,
        isPass: false,
      })
      .accountsPartial({
        authority: failPositionAuthority.publicKey,
        configAuthority: configAuthority.publicKey,
        market: marketPda,
        position: getPositionPda(failPositionAuthority.publicKey, marketPda),
        tradingMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([failPositionAuthority])
      .rpc();

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
  });

  test("claim winnings", async () => {
    const positionPda = getPositionPda(
      passPositionAuthority.publicKey,
      marketPda
    );

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
    const preMarketAtaBal = preMarketAtaAcc.amount;

    const prePassPositionAuthorityAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      passPositionAuthority.publicKey,
      false,
      TOKEN_PROGRAM_ID
    );
    const prePassPositionAtaAcc = await getAccount(
      provider.connection,
      prePassPositionAuthorityAta,
      "processed"
    );
    const prePassPositionAuthorityAtaBal = prePassPositionAtaAcc.amount;

    await program.methods
      .claimWinnings()
      .accountsPartial({
        authority: passPositionAuthority.publicKey,
        market: marketPda,
        position: positionPda,
        tradingMint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([passPositionAuthority])
      .rpc();

    const postMarketAtaAcc = await getAccount(
      provider.connection,
      marketAta,
      "processed"
    );
    const postMarketAtaBal = postMarketAtaAcc.amount;

    expect(preMarketAtaBal).toBeGreaterThan(postMarketAtaBal);

    const postPassPositionAuthorityAtaAcc = await getAccount(
      provider.connection,
      prePassPositionAuthorityAta,
      "processed"
    );
    const postPassPositionAuthorityAtaBal =
      postPassPositionAuthorityAtaAcc.amount;

    expect(prePassPositionAuthorityAtaBal).toBeLessThan(
      postPassPositionAuthorityAtaBal
    );
  });

  test("throws if there's no claimable winnings", async () => {
    const positionPda = getPositionPda(
      failPositionAuthority.publicKey,
      marketPda
    );

    try {
      await program.methods
        .claimWinnings()
        .accountsPartial({
          authority: failPositionAuthority.publicKey,
          market: marketPda,
          position: positionPda,
          tradingMint: USDC_MINT,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .signers([failPositionAuthority])
        .rpc();
    } catch (err) {
      expectAnchorError(err, "NoClaimableWinnings");
    }
  });
});
