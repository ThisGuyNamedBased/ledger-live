import { address } from "@solana/addresses";
import { pipe } from "@solana/functional";
import { AccountRole } from "@solana/instructions";
import {
  createKeyPairSignerFromBytes,
  setTransactionMessageFeePayerSigner,
  signTransactionMessageWithSigners,
} from "@solana/signers";
import {
  appendTransactionMessageInstruction,
  createTransactionMessage,
  setTransactionMessageLifetimeUsingBlockhash,
} from "@solana/transaction-messages";
import { getBase64EncodedWireTransaction } from "@solana/transactions";
import { Connection } from "@solana/web3.js";
import { PAYER } from "./connection";

const RPC_URL = "http://localhost:8899";
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

function solTransferInstruction(from: string, to: string, lamports: bigint) {
  const data = new Uint8Array(12);
  const view = new DataView(data.buffer);
  view.setUint32(0, 2, true);
  view.setBigUint64(4, lamports, true);
  return {
    programAddress: SYSTEM_PROGRAM,
    accounts: [
      { address: address(from), role: AccountRole.WRITABLE_SIGNER },
      { address: address(to), role: AccountRole.WRITABLE },
    ],
    data,
  };
}

export async function broadcastV1Transfer(toAddress: string, lamports: bigint): Promise<string> {
  const connection = new Connection(RPC_URL, "confirmed");
  const signer = await createKeyPairSignerFromBytes(PAYER.secretKey);
  const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash();
  type BlockhashLifetime = Parameters<typeof setTransactionMessageLifetimeUsingBlockhash>[0];
  const blockhashLifetime: BlockhashLifetime = {
    blockhash: blockhash as BlockhashLifetime["blockhash"],
    lastValidBlockHeight: BigInt(lastValidBlockHeight),
  };

  const message = pipe(
    createTransactionMessage({ version: 1 }),
    m => setTransactionMessageFeePayerSigner(signer, m),
    m => setTransactionMessageLifetimeUsingBlockhash(blockhashLifetime, m),
    m =>
      appendTransactionMessageInstruction(
        solTransferInstruction(signer.address, toAddress, lamports),
        m,
      ),
  );
  const signedTx = await signTransactionMessageWithSigners(message);
  const wireTransaction = getBase64EncodedWireTransaction(signedTx);
  const signature = await connection.sendRawTransaction(Buffer.from(wireTransaction, "base64"), {
    skipPreflight: true,
  });

  await connection.confirmTransaction({ blockhash, lastValidBlockHeight, signature });

  return signature;
}
