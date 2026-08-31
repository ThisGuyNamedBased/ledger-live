import type {
  SolanaTransaction as WalletAPISolanaTransaction,
  TransactionModel as WalletAPISolanaTransactionModel,
} from "@ledgerhq/wallet-api-core";
import type BigNumber from "bignumber.js";
import type { GetWalletAPITransactionSignFlowInfos } from "../../wallet-api/types";
import {
  createStakeAccountTransaction,
  delegateTransaction,
  setTransactionMemo,
  undelegateTransaction,
  withdrawTransaction,
} from "./transactions";
import type { Transaction } from "./types";

// Solana fees are chain-computed and not editable, so a live app can neither provide nor let the
// user change them.
const CAN_EDIT_FEES = false;

const HAS_FEES_PROVIDED = false;

// The wallet API protocol is fixed by `@ledgerhq/wallet-api-core` and still describes a Solana
// transaction as a `model: { kind, uiState }`; the generic bridge only reads a flat `mode`.
function fromWalletAPIModel(
  model: WalletAPISolanaTransactionModel,
  amount: BigNumber,
): Partial<Transaction> {
  switch (model.kind) {
    case "transfer":
    case "token.transfer":
      return {
        mode: "send",
        ...("subAccountId" in model.uiState ? { subAccountId: model.uiState.subAccountId } : {}),
        ...(model.uiState.memo ? setTransactionMemo(model.uiState.memo) : {}),
      };
    case "stake.createAccount":
      return createStakeAccountTransaction(model.uiState.delegate.voteAccAddress, amount);
    case "stake.delegate":
      return delegateTransaction(model.uiState.stakeAccAddr, model.uiState.voteAccAddr);
    case "stake.undelegate":
      return undelegateTransaction(model.uiState.stakeAccAddr);
    case "stake.withdraw":
      return withdrawTransaction(model.uiState.stakeAccAddr, amount);
    default:
      // Letting `token.createATA`, `token.approve`, `token.revoke` or `stake.split` through would
      // craft a transfer instead: the generic bridge has no intent for them.
      throw new Error(`Unsupported Solana wallet API transaction: ${model.kind}`);
  }
}

const getWalletAPITransactionSignFlowInfos: GetWalletAPITransactionSignFlowInfos<
  WalletAPISolanaTransaction,
  Transaction
> = ({ walletApiTransaction, account }) => {
  const { model, ...common } = walletApiTransaction;

  const liveTx: Partial<Transaction> = {
    ...common,
    family: "solana",
    ...fromWalletAPIModel(model, walletApiTransaction.amount),
  };

  if (!liveTx.subAccountId && account.type === "TokenAccount") {
    liveTx.subAccountId = account.id;
  }

  return {
    canEditFees: CAN_EDIT_FEES,
    liveTx,
    hasFeesProvided: HAS_FEES_PROVIDED,
  };
};

export default { getWalletAPITransactionSignFlowInfos };
