import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { TofuTokenizer } from "../target/types/tofu_tokenizer";
import { AccountLayout, createAccount, createInitializeAccountInstruction, createInitializeMintInstruction, createMint, createTransferInstruction, mintTo, TOKEN_PROGRAM_ID } from "@solana/spl-token";

import {
  getKeypair, getProgramId,
  getPublicKey, getTerms,
  getTokenBalance,
  writePublicKey,
} from "./utils";
import { Keypair, LAMPORTS_PER_SOL, PublicKey, Signer, SystemProgram } from "@solana/web3.js";
import * as assert from "assert";

describe('tofu-tokenizer', () => {

  // Configure the client to use the local cluster.
  const provider = anchor.AnchorProvider.env();
  anchor.setProvider(provider);

  const program = anchor.workspace.TofuTokenizer as Program<TofuTokenizer>;

  const TOKENIZER_PDA_SEED = "tokenizer";

  it('Setup', async () => {
    const _createMint = (payer: Signer) => {
      return createMint(
        provider.connection,
        payer,
        payer.publicKey,
        null,
        0,
        undefined,
        undefined,
        TOKEN_PROGRAM_ID
      );
    }

    const setupMint = async (
      name: string,
      alicePublicKey: PublicKey,
      bobPublicKey: PublicKey,
      clientKeypair: Signer,
    ): Promise<[PublicKey, PublicKey, PublicKey]> => {
      console.log(`Creating Mint ${name} ...`);
      const mint = await _createMint(clientKeypair)
      writePublicKey(mint, `mint_${name.toLowerCase()}`);

      console.log(`Creating Alice TokenAccount for ${name}...`);
      const aliceTokenAccount = await createAccount(provider.connection, clientKeypair, mint, alicePublicKey);
      writePublicKey(aliceTokenAccount, `alice_${name.toLowerCase()}`);

      console.log(`Creating Bob TokenAccount for ${name}...`);
      const bobTokenAccount = await createAccount(provider.connection, clientKeypair, mint, bobPublicKey);
      writePublicKey(bobTokenAccount, `bob_${name.toLowerCase()}`);

      return [mint, aliceTokenAccount, bobTokenAccount];
    }

    const alicePublicKey = getPublicKey("alice");
    const bobPublicKey = getPublicKey("bob");
    const clientKeypair = getKeypair("id");

    // Airdrop SOL
    console.log("Requesting SOL for Alice...");
    const airdropAlice = await provider.connection.requestAirdrop(alicePublicKey, LAMPORTS_PER_SOL * 10);
    console.log("Requesting SOL for Bob...");
    const airdropBob = await provider.connection.requestAirdrop(bobPublicKey, LAMPORTS_PER_SOL * 10);
    console.log("Requesting SOL for Client...");
    const airdropClient = await provider.connection.requestAirdrop(clientKeypair.publicKey, LAMPORTS_PER_SOL * 10);

    await provider.connection.confirmTransaction(airdropAlice, "processed");
    await provider.connection.confirmTransaction(airdropBob, "processed");
    await provider.connection.confirmTransaction(airdropClient, "processed");

    const [mintTofu, aliceTokenAccountForTofu, bobTokenAccountForTofu] = await setupMint(
      "Tofu",
      alicePublicKey,
      bobPublicKey,
      clientKeypair,
    );
    console.log("Sending 50 Tofu to Alice's Tofu TokenAccount ...");
    await mintTo(provider.connection, clientKeypair, mintTofu, aliceTokenAccountForTofu, clientKeypair, 50);

    const [mintPotato, aliceTokenAccountForPotato, bobTokenAccountForPotato] = await setupMint(
      "Potato",
      alicePublicKey,
      bobPublicKey,
      clientKeypair,
    );
    console.log("Sending 50 Potatoes to Bob's Potato TokenAccount ...");
    await mintTo(provider.connection, clientKeypair, mintPotato, bobTokenAccountForPotato, clientKeypair, 50);

    console.log("✨Setup complete✨\n");
    console.table([
      {
        "Alice Token Account Tofu": await getTokenBalance(
          aliceTokenAccountForTofu,
          provider.connection
        ),
        "Alice Token Account Potato": await getTokenBalance(
          aliceTokenAccountForPotato,
          provider.connection
        ),
        "Bob Token Account Tofu": await getTokenBalance(
          bobTokenAccountForTofu,
          provider.connection
        ),
        "Bob Token Account Potato": await getTokenBalance(
          bobTokenAccountForPotato,
          provider.connection
        ),
      },
    ]);
    console.log("");
  });

  it("Alice", async () => {
    const terms = getTerms();

    const aliceTofuTokenAccountPubkey = getPublicKey("alice_tofu");
    const alicePotatoTokenAccountPubkey = getPublicKey("alice_potato");
    const TofuTokenMintPubkey = getPublicKey("mint_tofu");
    const aliceKeypair = getKeypair("alice");

    // Init
    const tempTofuTokenAccountKeypair = anchor.web3.Keypair.generate();
    const tokenizerKeypair = anchor.web3.Keypair.generate();

    console.log("Creating temp token Account")
    const createTempTokenAccountIx = SystemProgram.createAccount({
      programId: TOKEN_PROGRAM_ID,
      space: AccountLayout.span,
      lamports: await provider.connection.getMinimumBalanceForRentExemption(AccountLayout.span),
      fromPubkey: aliceKeypair.publicKey,
      newAccountPubkey: tempTofuTokenAccountKeypair.publicKey,
    });
    const initTempAccountIx = createInitializeAccountInstruction(tempTofuTokenAccountKeypair.publicKey, TofuTokenMintPubkey, aliceKeypair.publicKey, TOKEN_PROGRAM_ID);
    const transferTofuTokensToTempAccIx = createTransferInstruction(aliceTofuTokenAccountPubkey, tempTofuTokenAccountKeypair.publicKey, aliceKeypair.publicKey, terms.bobExpectedAmount);

    const tx = new anchor.web3.Transaction().add(
      createTempTokenAccountIx,
      initTempAccountIx,
      transferTofuTokensToTempAccIx,
    );
    const txSig = await provider.connection.sendTransaction(
      tx,
      [aliceKeypair, tempTofuTokenAccountKeypair],
      { skipPreflight: false, preflightCommitment: "confirmed" }
    );
    await provider.connection.confirmTransaction(txSig);

    console.log("Sending Alice's transaction...");
    let initTx = await program.methods.initialize(new anchor.BN(terms.aliceExpectedAmount)).accounts({
      initializer: aliceKeypair.publicKey,
      tempTokenAccount: tempTofuTokenAccountKeypair.publicKey,
      tokenToReceiveAccount: alicePotatoTokenAccountPubkey,
      tokenizerAccount: tokenizerKeypair.publicKey,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: anchor.web3.SystemProgram.programId,
    }).signers([aliceKeypair, tokenizerKeypair]).rpc();

    await provider.connection.confirmTransaction(initTx, "confirmed");

    const tokenizer = await program.account.tokenizer.fetch(tokenizerKeypair.publicKey);

    assert.equal(
      tokenizer.isInitialized,
      true,
      "tokenizer state initialization flag has not been set");
    assert.equal(
      tokenizer.initializerPubkey.toBase58(),
      aliceKeypair.publicKey.toBase58(),
      "InitializerPubkey has not been set correctly / not been set to Alice's public key");
    assert.equal(
      tokenizer.initializerTokenToReceiveAccountPubkey.toBase58(),
      alicePotatoTokenAccountPubkey.toBase58(),
      "initializerTokenToReceiveAccountPubkey has not been set correctly / not been set to Alice's Potato public key");
    assert.equal(
      tokenizer.tempTokenAccountPubkey.toBase58(),
      tempTofuTokenAccountKeypair.publicKey.toBase58(),
      "tempTofuTokenAccountKeypair has not been set correctly / not been set to temp Tofu token account public key");

    // Persist tokenizer key
    writePublicKey(tokenizerKeypair.publicKey, "tokenizer");

    console.table([
      {
        "Alice Token Account Tofu": await getTokenBalance(
          aliceTofuTokenAccountPubkey,
          provider.connection
        ),
        "Alice Token Account Potato": await getTokenBalance(
          alicePotatoTokenAccountPubkey,
          provider.connection
        ),
        "Bob Token Account Tofu": await getTokenBalance(
          getPublicKey("bob_tofu"),
          provider.connection
        ),
        "Bob Token Account Potato": await getTokenBalance(
          getPublicKey("bob_potato"),
          provider.connection
        ),
        "Temporary Token Account Tofu": await getTokenBalance(
          tempTofuTokenAccountKeypair.publicKey,
          provider.connection
        ),
      },
    ]);
    console.log("");
  });

  it("Bob", async () => {
    const bobKeypair = getKeypair("bob");
    const bobTofuTokenAccountPubkey = getPublicKey("bob_tofu");
    const bobPotatoTokenAccountPubkey = getPublicKey("bob_potato");
    const tokenizerStateAccountPubkey = getPublicKey("tokenizer");
    const tokenizerProgramId = getProgramId();
    const terms = getTerms();

    const tokenizer = await program.account.tokenizer.fetch(tokenizerStateAccountPubkey);
    assert.ok(tokenizer, "Could not find tokenizer at given address!");

    const PDA = await PublicKey.findProgramAddress(
      [Buffer.from(TOKENIZER_PDA_SEED)],
      tokenizerProgramId,
    );

    const alicePotatoTokenAccountPubkey = getPublicKey("alice_potato");
    const [alicePotatoBalance, bobTofuBalance] = await Promise.all([
      getTokenBalance(alicePotatoTokenAccountPubkey, provider.connection),
      getTokenBalance(bobTofuTokenAccountPubkey, provider.connection),
    ]);

    console.log("Sending Bob's transaction...");
    const exchangeTx = await program.methods.exchange(
      new anchor.BN(terms.bobExpectedAmount)).accounts({
        taker: bobKeypair.publicKey,
        takersSendingTokenAccount: bobPotatoTokenAccountPubkey,
        takersTokenToReceiveAccount: bobTofuTokenAccountPubkey,
        pdasTempTokenAccount: tokenizer.tempTokenAccountPubkey,
        initializersMainAccount: tokenizer.initializerPubkey,
        initializersTokenToReceiveAccount: tokenizer.initializerTokenToReceiveAccountPubkey,
        tokenizerAccount: tokenizerStateAccountPubkey,
        tokenProgram: TOKEN_PROGRAM_ID,
        pdaAccount: PDA[0]
      }).signers([bobKeypair]).rpc();
    await provider.connection.confirmTransaction(exchangeTx, "confirmed");

    assert.equal(
      await provider.connection.getAccountInfo(tokenizerStateAccountPubkey),
      null,
      "tokenizer account has not been closed."
    );
    assert.equal(
      await provider.connection.getAccountInfo(tokenizer.tempTokenAccountPubkey),
      null,
      "Temp Tofu token account has not been closed."
    );

    const [newAlicePotatoBalance, newBobTofuBalance] = await Promise.all([
      getTokenBalance(alicePotatoTokenAccountPubkey, provider.connection),
      getTokenBalance(bobTofuTokenAccountPubkey, provider.connection),
    ]);

    assert.equal(
      newAlicePotatoBalance,
      alicePotatoBalance + terms.aliceExpectedAmount,
      `Alice's Potato balance should be ${alicePotatoBalance + terms.aliceExpectedAmount} but is ${newAlicePotatoBalance}`
    );
    assert.equal(
      newBobTofuBalance,
      bobTofuBalance + terms.bobExpectedAmount,
      `Bob's Tofu balance should be ${bobTofuBalance + terms.bobExpectedAmount} but is ${newBobTofuBalance}`
    );

    console.log(
      "✨Trade successfully executed. All temporary accounts closed✨\n"
    );
    console.table([
      {
        "Alice Token Account Tofu": await getTokenBalance(
          getPublicKey("alice_tofu"),
          provider.connection
        ),
        "Alice Token Account Potato": newAlicePotatoBalance,
        "Bob Token Account Tofu": newBobTofuBalance,
        "Bob Token Account Potato": await getTokenBalance(
          bobPotatoTokenAccountPubkey,
          provider.connection
        ),
      },
    ]);
    console.log("");
  });
});