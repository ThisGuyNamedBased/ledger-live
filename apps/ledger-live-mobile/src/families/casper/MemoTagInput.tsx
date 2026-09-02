import React from "react";
import { useTranslation } from "~/context/Locale";

import type { Transaction as CasperTransaction } from "@ledgerhq/live-common/families/casper/types";
import type { MemoTagInputProps } from "LLM/features/MemoTag/types";
import { GenericMemoTagInput } from "LLM/features/MemoTag/components/GenericMemoTagInput";

export default (props: MemoTagInputProps<CasperTransaction>) => {
  const { t } = useTranslation();
  return (
    <GenericMemoTagInput
      {...props}
      textToValue={text => text.replace(/\D/g, "")}
      // Cleared state mirrors descriptor/send/memo.ts casper handler — keep in sync.
      valueToTxPatch={value => tx => ({
        ...tx,
        transferId: value || undefined,
        memoType: value ? "transferId" : null,
        memoValue: value || null,
      })}
      placeholder={t("send.summary.transferId")}
    />
  );
};
