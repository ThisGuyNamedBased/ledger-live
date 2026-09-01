import React, { useCallback } from "react";
import { Trans, useTranslation } from "react-i18next";
import { shortAddressPreview } from "@ledgerhq/live-common/account/index";
import { formatCurrencyUnit } from "@ledgerhq/live-common/currencies/index";
import { getAddressExplorer, getDefaultExplorerView } from "@ledgerhq/live-common/explorers";
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
import { openURL } from "~/renderer/linking";
import { useAleoLiveBlockHeight } from "../hooks/useAleoLiveBlockHeight";
import { Claim, Column, Ellipsis, SubLabel, TableLine, Wrapper } from "../blocks/Staking";
import type { AleoStakingPosition } from "./useStakingPosition";

const COLUMNS = [
  "aleo.stake.table.validator",
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
  const { bondedValidator, validatorLabel, unbondingBalance, unbondingHeight, claimableBalance } =
    position;

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

  const onExternalLink = useCallback(() => {
    if (!bondedValidator) return;
    const explorerView = getDefaultExplorerView(account.currency);
    const url = explorerView && getAddressExplorer(explorerView, bondedValidator);
    if (url) openURL(url);
  }, [account.currency, bondedValidator]);

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
        <Column strong clickable={!!bondedValidator} onClick={onExternalLink}>
          <Box mr={2}>
            <FirstLetterIcon label={validatorLabel || "?"} />
          </Box>
          <Box style={{ minWidth: 0 }}>
            <Ellipsis>{validatorLabel || t("aleo.stake.table.unknownValidator")}</Ellipsis>
            {bondedValidator ? (
              <ToolTip content={bondedValidator}>
                <SubLabel>{shortAddressPreview(bondedValidator)}</SubLabel>
              </ToolTip>
            ) : null}
          </Box>
        </Column>

        <Column>
          <Box color={isClaimable ? "positiveGreen" : "neutral.c70"} pl={2}>
            <ToolTip
              content={t(
                isClaimable
                  ? "aleo.stake.unstaking.claimableTooltip"
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
          {isClaimable || blocksLeft === 0 ? (
            <Claim onClick={onClaim} data-testid="aleo-claim-cta">
              <Trans i18nKey="aleo.stake.claim" />
            </Claim>
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
