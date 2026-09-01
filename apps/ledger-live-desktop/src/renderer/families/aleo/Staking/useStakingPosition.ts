import BigNumber from "bignumber.js";
import { useMemo } from "react";
import type { AleoAccount, AleoValidator } from "@ledgerhq/live-common/families/aleo/types";
import { useAleoValidators } from "@ledgerhq/live-common/families/aleo/react";
import { getClaimableStakingBalance } from "@ledgerhq/live-common/families/aleo/utils";

/**
 * Why the bonded position earns nothing. The three validator-side reasons come straight
 * from the coin module; `leftCommittee` is derived here, since `getValidators` only ever
 * returns current committee members and absence is therefore the signal.
 *
 * The epic's fourth case — the user's own stake below the 10,000 ALEO delegator minimum —
 * is not represented: `unbond_public` unbonds the whole position rather than leaving a
 * remainder under the minimum, so a bonded balance below it is not a reachable state.
 */
export type AleoNonEarningReason = NonNullable<AleoValidator["nonEarningReason"]> | "leftCommittee";

export type AleoStakingPosition = {
  bondedBalance: BigNumber;
  bondedValidator: string | null;
  /** Validator name when known, otherwise the address. */
  validatorLabel: string;
  nonEarningReason: AleoNonEarningReason | undefined;
  /**
   * Estimated net yearly rate as a fraction (0.07 = 7%). Undefined when it could not be
   * derived; `0` is a real value meaning "earns nothing" — never conflate the two.
   */
  estimatedRate: number | undefined;
  unbondingBalance: BigNumber;
  unbondingHeight: number | null;
  claimableBalance: BigNumber;
  hasBonded: boolean;
  hasUnbonding: boolean;
};

/**
 * The validator of the most recent BOND operation, used to name a position whose `bonded`
 * mapping the chain has already dropped.
 *
 * Best-effort: it depends on the explorer reporting the validator as the bond's recipient.
 * When it does not, the caller falls back to an "unknown validator" label rather than
 * showing a wrong name.
 */
function lastBondedValidator(account: AleoAccount): string | undefined {
  const recipient = account.operations.find(
    operation => operation.type === "BOND" && operation.recipients[0],
  )?.recipients[0];

  return recipient && recipient !== account.freshAddress ? recipient : undefined;
}

export function useStakingPosition(account: AleoAccount): AleoStakingPosition {
  const { validators, loading } = useAleoValidators(account.currency);

  const bondedBalance = account.aleoResources?.bondedBalance ?? new BigNumber(0);
  const unbondingBalance = account.aleoResources?.unbondingBalance ?? new BigNumber(0);
  const unbondingHeight = account.aleoResources?.unbondingHeight ?? null;
  const claimableBalance = getClaimableStakingBalance(account);

  // A full unbond deletes the chain's `bonded` mapping outright, and the `unbonding` mapping
  // it leaves behind carries only an amount and a height — no validator. So during the
  // unbonding window the position's validator is gone from chain state, and the last BOND
  // operation is the only remaining record of who it was.
  const bondedValidator =
    account.aleoResources?.bondedValidator ?? lastBondedValidator(account) ?? null;

  const validator = useMemo(
    () => (bondedValidator ? validators.find(item => item.address === bondedValidator) : undefined),
    [validators, bondedValidator],
  );

  const hasBonded = bondedBalance.gt(0);

  // Absence only means "left the committee" once the list has actually arrived; while it
  // is loading every validator looks absent.
  const nonEarningReason: AleoNonEarningReason | undefined =
    loading || !hasBonded ? undefined : validator ? validator.nonEarningReason : "leftCommittee";

  const estimatedRate = nonEarningReason ? 0 : validator?.estimatedYearlyRewardsRate;

  return {
    bondedBalance,
    bondedValidator,
    validatorLabel: validator?.name || bondedValidator || "",
    nonEarningReason,
    estimatedRate,
    unbondingBalance,
    unbondingHeight,
    claimableBalance,
    hasBonded,
    hasUnbonding: unbondingBalance.gt(0),
  };
}
