import React, { useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import type { AleoAccount } from "@ledgerhq/live-common/families/aleo/types";
import { useDispatch } from "LLD/hooks/redux";
import { openModal } from "~/renderer/actions/modals";
import Box from "~/renderer/components/Box/Box";
import Discreet from "~/renderer/components/Discreet";
import FirstLetterIcon from "~/renderer/components/FirstLetterIcon";
import TableContainer, { HeaderWrapper, TableHeader } from "~/renderer/components/TableContainer";
import ToolTip from "~/renderer/components/Tooltip";
import ClockIcon from "~/renderer/icons/Clock";
import { useAccountUnit } from "~/renderer/hooks/useAccountUnit";
import { useAleoLiveBlockHeight } from "../hooks/useAleoLiveBlockHeight";
import { useSyncOnUnbondingComplete } from "../hooks/useSyncOnUnbondingComplete";
import { Claim, Column, Ellipsis, TableLine, Wrapper } from "../blocks/Staking";
import type { AleoStakingPosition } from "./useStakingPosition";

const COLUMNS = [
  "aleo.stake.table.source",
  "aleo.stake.table.status",
  "aleo.stake.table.amount",
  "aleo.stake.table.completion",
];

type Props = {
  account: AleoAccount;
  position: AleoStakingPosition;
};

const Unstakings = ({ account, position }: Props) => {
  const { t } = useTranslation();
  const dispatch = useDispatch();
  const unit = useAccountUnit(account);
  const {
    unbondingBalance,
    unbondingHeight,
    claimableBalance,
    hasPendingClaim,
    hasPendingUnbondingChange,
  } = position;

  const isClaimable = claimableBalance.gt(0);

  // Only poll while there is something to count down to; once claimable the height stops
  // mattering, and the account's own synced height is enough the rest of the time.
  const isCountingDown =
    !isClaimable && unbondingHeight != null && unbondingHeight > account.blockHeight;
  const currentHeight = useAleoLiveBlockHeight(account.currency, {
    fallbackHeight: account.blockHeight,
    enabled: isCountingDown,
  });
  const blocksLeft = unbondingHeight != null ? Math.max(0, unbondingHeight - currentHeight) : null;

  // The live poll has seen the unbonding height pass, but `account.blockHeight` has not caught
  // up yet — and that synced height is what `getClaimableStakingBalance` and the bridge's own
  // validation read. Offering the CTA here would open a flow with no amount and a disabled
  // Continue, so the row reports that it is settling and asks for a sync instead.
  const isSettling = !isClaimable && blocksLeft === 0;
  useSyncOnUnbondingComplete(account.id, isSettling);

  const onClaim = useCallback(() => {
    dispatch(openModal("MODAL_ALEO_CLAIM_UNBOND", { account }));
  }, [account, dispatch]);

  return (
    <TableContainer mb={6}>
      <TableHeader
        title={<Trans i18nKey="aleo.stake.unstaking.header" />}
        titleProps={{ "data-e2e": "title_Unstaking" }}
        tooltip={<Trans i18nKey="aleo.stake.unstaking.headerTooltip" />}
      />

      <HeaderWrapper>
        {COLUMNS.map(column => (
          <TableLine key={column}>
            <Trans i18nKey={column} />
          </TableLine>
        ))}
      </HeaderWrapper>

      <Wrapper>
        <Column strong>
          <Box mr={2}>
            <FirstLetterIcon label={t("aleo.stake.unstaking.source")} />
          </Box>
          <Box style={{ minWidth: 0 }}>
            <ToolTip content={t("aleo.stake.unstaking.sourceTooltip")}>
              <Ellipsis>{t("aleo.stake.unstaking.source")}</Ellipsis>
            </ToolTip>
          </Box>
        </Column>

        <Column>
          <Box color={isClaimable ? "positiveGreen" : "neutral.c70"} pl={2}>
            <ToolTip
              content={t(
                isClaimable
                  ? "aleo.stake.unstaking.claimableTooltip"
                  : isSettling
                    ? "aleo.stake.unstaking.settlingTooltip"
                    : "aleo.stake.unstaking.pendingTooltip",
              )}
            >
              <ClockIcon size={14} />
            </ToolTip>
          </Box>
        </Column>

        <Column>
          <Discreet>
            {formatCurrencyUnit(unit, unbondingBalance, {
              showCode: true,
              disableRounding: true,
            })}
          </Discreet>
        </Column>

        <Column>
          {hasPendingUnbondingChange ? (
            // Both `unbond_public` and `claim_unbond_public` rewrite the single `unbonding`
            // slot these figures come from, so either in flight makes a claim unsafe — not
            // just a claim. Which one it is only changes what the row says.
            hasPendingClaim ? (
              <ToolTip content={t("aleo.stake.unstaking.claimPendingTooltip")}>
                <span data-testid="aleo-claim-pending">
                  {t("aleo.stake.unstaking.claimPending")}
                </span>
              </ToolTip>
            ) : (
              <ToolTip content={t("aleo.stake.unstaking.unbondPendingTooltip")}>
                <span data-testid="aleo-unbond-pending">
                  {t("aleo.stake.unstaking.unbondPending")}
                </span>
              </ToolTip>
            )
          ) : isClaimable ? (
            <Claim onClick={onClaim} data-testid="aleo-claim-cta">
              <Trans i18nKey="aleo.stake.claim" />
            </Claim>
          ) : isSettling ? (
            <ToolTip content={t("aleo.stake.unstaking.settlingTooltip")}>
              <span data-testid="aleo-claim-settling">{t("aleo.stake.unstaking.settling")}</span>
            </ToolTip>
          ) : (
            <ToolTip
              content={
                unbondingHeight != null
                  ? t("aleo.stake.claimableAtTooltip", {
                      height: unbondingHeight,
                      current: currentHeight,
                    })
                  : null
              }
            >
              <span>
                {blocksLeft != null ? t("aleo.stake.blocksRemaining", { count: blocksLeft }) : "-"}
              </span>
            </ToolTip>
          )}
        </Column>
      </Wrapper>
    </TableContainer>
  );
};

export default Unstakings;
