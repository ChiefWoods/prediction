import { Program } from "@coral-xyz/anchor";
import { LiteSVMProvider } from "anchor-litesvm";
import { beforeEach, describe, expect, test } from "bun:test";
import { LiteSVM } from "litesvm";
import { Prediction } from "../../target/types/prediction";
import { Keypair } from "@solana/web3.js";
import { fundedSystemAccountInfo, getSetup } from "../setup";
import { getConfigPda } from "../pda";
import { fetchConfigAcc } from "../accounts";
import { USDC_MINT } from "../constants";
import {
  getAssociatedTokenAddressSync,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

describe("initializeConfig", () => {
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
  });

  test("initializes config", async () => {
    const feeBps = 10; // 0.1%

    await program.methods
      .initializeConfig({
        feeBps,
      })
      .accounts({
        authority: configAuthority.publicKey,
        mint: USDC_MINT,
        tokenProgram: TOKEN_PROGRAM_ID,
      })
      .signers([configAuthority])
      .rpc();

    const configPda = getConfigPda();
    const configAcc = await fetchConfigAcc(program, configPda);

    expect(configAcc.authority).toStrictEqual(configAuthority.publicKey);
    expect(configAcc.feeBps).toBe(feeBps);
    expect(configAcc.mint).toStrictEqual(USDC_MINT);

    const configAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      configPda,
      true,
      TOKEN_PROGRAM_ID
    );
    const configAtaAcc = litesvm.getAccount(configAta);

    expect(configAtaAcc).not.toBeNull();
  });
});
