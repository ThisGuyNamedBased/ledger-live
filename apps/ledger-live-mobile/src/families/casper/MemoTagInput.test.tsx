import React from "react";
import { render } from "@testing-library/react-native";
import BigNumber from "bignumber.js";
import type { MemoTagInputProps } from "LLM/features/MemoTag/types";
import type { Transaction as CasperTransaction } from "@ledgerhq/live-common/families/casper/types";

const MockGenericMemoTagInput = jest.fn(() => null);

jest.mock("~/context/Locale", () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}));

jest.mock("LLM/features/MemoTag/components/GenericMemoTagInput", () => ({
  GenericMemoTagInput: MockGenericMemoTagInput,
}));

import MemoTagInput from "./MemoTagInput";

const baseTx: CasperTransaction = {
  family: "casper",
  amount: new BigNumber(0),
  recipient: "",
  fees: new BigNumber(0),
  useAllAmount: false,
};

const baseProps: MemoTagInputProps<CasperTransaction> = {
  onChange: jest.fn(),
};

beforeEach(() => {
  MockGenericMemoTagInput.mockClear();
});

describe("MemoTagInput", () => {
  it("renders GenericMemoTagInput", () => {
    render(<MemoTagInput {...baseProps} />);
    expect(MockGenericMemoTagInput).toHaveBeenCalledTimes(1);
  });

  describe("textToValue", () => {
    function getTextToValue() {
      render(<MemoTagInput {...baseProps} />);
      return (MockGenericMemoTagInput.mock.calls[0][0] as { textToValue: (t: string) => string })
        .textToValue;
    }

    it("strips non-digit characters", () => {
      expect(getTextToValue()("abc123def")).toBe("123");
    });

    it("returns empty string when input has no digits", () => {
      expect(getTextToValue()("abc")).toBe("");
    });

    it("leaves pure numeric strings unchanged", () => {
      expect(getTextToValue()("456")).toBe("456");
    });
  });

  describe("valueToTxPatch", () => {
    function getValueToTxPatch() {
      render(<MemoTagInput {...baseProps} />);
      return (
        MockGenericMemoTagInput.mock.calls[0][0] as {
          valueToTxPatch: (v: string) => (tx: CasperTransaction) => CasperTransaction;
        }
      ).valueToTxPatch;
    }

    it("sets transferId, memoType, and memoValue when value is non-empty", () => {
      const patch = getValueToTxPatch()("123")(baseTx);
      expect(patch.transferId).toBe("123");
      expect(patch.memoType).toBe("transferId");
      expect(patch.memoValue).toBe("123");
    });

    it("clears memo fields when value is empty string", () => {
      const patch = getValueToTxPatch()("")(baseTx);
      expect(patch.transferId).toBeUndefined();
      expect(patch.memoType).toBeNull();
      expect(patch.memoValue).toBeNull();
    });
  });
});
