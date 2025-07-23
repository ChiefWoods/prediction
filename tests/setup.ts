import { LAMPORTS_PER_SOL, PublicKey, SystemProgram } from "@solana/web3.js";
import { AccountInfoBytes, Clock, LiteSVM } from "litesvm";
import { fromWorkspace, LiteSVMProvider } from "anchor-litesvm";
import { Prediction } from "../target/types/prediction";
import { AnchorError, Program } from "@coral-xyz/anchor";
import idl from "../target/idl/prediction.json";
import { expect } from "bun:test";
import {
  ACCOUNT_SIZE,
  AccountLayout,
  getAssociatedTokenAddressSync,
  MINT_SIZE,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import {
  PYTH_SOLANA_RECEIVER_PROGRAM_ID,
  SOL_USD_PRICE_UPDATE_V2,
  USDC_MINT,
  USDC_MINT_DECIMALS,
} from "./constants";
import priceUpdateV2AccInfo from "./fixtures/sol_usd_price_update_v2.json";

export async function getSetup(
  accounts: { pubkey: PublicKey; account: AccountInfoBytes }[] = []
) {
  const litesvm = fromWorkspace("./");
  litesvm.withLogBytesLimit(null);

  initUsdcMint(litesvm);

  litesvm.setAccount(SOL_USD_PRICE_UPDATE_V2, {
    data: Buffer.from(priceUpdateV2AccInfo.account.data[0], "base64"),
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: PYTH_SOLANA_RECEIVER_PROGRAM_ID,
  });

  for (const { pubkey, account } of accounts) {
    litesvm.setAccount(new PublicKey(pubkey), {
      data: account.data,
      executable: account.executable,
      lamports: account.lamports,
      owner: new PublicKey(account.owner),
    });
  }

  const provider = new LiteSVMProvider(litesvm);
  const program = new Program<Prediction>(idl, provider);

  return { litesvm, provider, program };
}

export function fundedSystemAccountInfo(
  lamports: number = LAMPORTS_PER_SOL
): AccountInfoBytes {
  return {
    lamports,
    data: Buffer.alloc(0),
    owner: SystemProgram.programId,
    executable: false,
  };
}

export async function expectAnchorError(error: Error, code: string) {
  expect(error).toBeInstanceOf(AnchorError);
  const { errorCode } = (error as AnchorError).error;
  expect(errorCode.code).toBe(code);
}

export async function forwardTime(litesvm: LiteSVM, sec: number) {
  const clock = litesvm.getClock();
  litesvm.setClock(
    new Clock(
      clock.slot,
      clock.epochStartTimestamp,
      clock.epoch,
      clock.leaderScheduleEpoch,
      clock.unixTimestamp + BigInt(sec)
    )
  );
}

function initUsdcMint(litesvm: LiteSVM) {
  const daoMintData = Buffer.alloc(MINT_SIZE);

  MintLayout.encode(
    {
      mintAuthority: PublicKey.default,
      mintAuthorityOption: 0,
      supply: BigInt(1000 * 10 ** USDC_MINT_DECIMALS),
      decimals: USDC_MINT_DECIMALS,
      isInitialized: true,
      freezeAuthority: PublicKey.default,
      freezeAuthorityOption: 0,
    },
    daoMintData
  );

  litesvm.setAccount(USDC_MINT, {
    data: daoMintData,
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: TOKEN_PROGRAM_ID,
  });
}

export function initUsdcAta(
  litesvm: LiteSVM,
  owner: PublicKey,
  amount: number = 100 * 10 ** USDC_MINT_DECIMALS
) {
  const ataData = Buffer.alloc(ACCOUNT_SIZE);

  AccountLayout.encode(
    {
      amount: BigInt(amount),
      closeAuthority: owner,
      closeAuthorityOption: 1,
      delegate: PublicKey.default,
      delegatedAmount: 0n,
      delegateOption: 0,
      isNative: 0n,
      isNativeOption: 0,
      mint: USDC_MINT,
      owner,
      state: 1,
    },
    ataData
  );

  const ata = getAssociatedTokenAddressSync(
    USDC_MINT,
    owner,
    false,
    TOKEN_PROGRAM_ID
  );

  litesvm.setAccount(ata, {
    data: ataData,
    executable: false,
    lamports: LAMPORTS_PER_SOL,
    owner: TOKEN_PROGRAM_ID,
  });
}
