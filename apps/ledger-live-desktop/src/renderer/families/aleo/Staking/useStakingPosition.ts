import BigNumber from "bignumber.js";
import { useMemo } from "react";
import type { AleoAccount, AleoValidator } from "@ledgerhq/live-common/families/aleo/types";
import { useAleoValidators } from "@ledgerhq/live-common/families/aleo/react";
import {
  getClaimableStakingBalance,
  hasPendingOperationType,
} from "@ledgerhq/live-common/families/aleo/utils";

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
  /**
   * An unbond or a claim already broadcast and not yet synced. Kept apart only so the UI can
   * name what is in flight; neither should be read as the gate on its own — use
   * `hasPendingUnbondingChange` for that.
   */
  hasPendingUnbond: boolean;
  hasPendingClaim: boolean;
  /**
   * The gate for both unbond and claim.
   *
   * `credits.aleo` gives a staker a single `unbonding` slot — one amount, one height — and
   * `unbond_public` and `claim_unbond_public` both rewrite it. So either operation in flight
   * invalidates the other's premise, not just its own: a claim broadcast while an unbond is
   * pending targets a slot that unbond is about to rewrite, and an unbond broadcast while a
   * claim is pending targets one that claim is about to empty. Guarding each action against
   * only its own type would leave both of those crossings open.
   */
  hasPendingUnbondingChange: boolean;
};

export function useStakingPosition(account: AleoAccount): AleoStakingPosition {
  const { validators, loading } = useAleoValidators(account.currency);

  const bondedBalance = account.aleoResources?.bondedBalance ?? new BigNumber(0);
  const unbondingBalance = account.aleoResources?.unbondingBalance ?? new BigNumber(0);
  const unbondingHeight = account.aleoResources?.unbondingHeight ?? null;
  const claimableBalance = getClaimableStakingBalance(account);

  // Only ever the *currently bonded* validator. It is NOT a stand-in for the unbonding
  // position's origin: the `unbonding` mapping holds just an amount and a height, and after
  // a full unbond the user can bond elsewhere, leaving the two describing different
  // validators. The Unstakings table names the protocol rather than guessing.
  const bondedValidator = account.aleoResources?.bondedValidator ?? null;

  const validator = useMemo(
    () => (bondedValidator ? validators.find(item => item.address === bondedValidator) : undefined),
    [validators, bondedValidator],
  );

  const hasBonded = bondedBalance.gt(0);
  const hasPendingUnbond = hasPendingOperationType(account, "UNBOND");
  const hasPendingClaim = hasPendingOperationType(account, "WITHDRAW_UNBONDED");

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
    hasPendingUnbond,
    hasPendingClaim,
    hasPendingUnbondingChange: hasPendingUnbond || hasPendingClaim,
  };
}
