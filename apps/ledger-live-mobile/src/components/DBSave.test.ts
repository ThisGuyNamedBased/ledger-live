import { featureFlagsLense, payCardDbSaveSliceSelector, payCardPersistedSelector } from "./DBSave";
import type { State } from "~/reducers/types";

describe("featureFlagsLense", () => {
  it("projects only { overrides, bannerVisible } — never the transient remoteFlagsReady gate", () => {
    const overrides = { mockFeature: { enabled: true } };
    const state = {
      featureFlags: {
        overrides,
        bannerVisible: false,
        remoteFlagsReady: true,
      },
    } as unknown as State;

    const projected = featureFlagsLense(state);

    expect(projected).toEqual({ overrides, bannerVisible: false });
    expect(projected).not.toHaveProperty("remoteFlagsReady");
  });
});

describe("payCardPersistedSelector (mobile persistence lens)", () => {
  it("composes { hasSeenFeatureTour, balanceFilter, hasSeenLoginIntro } from all three pay card flow slices", () => {
    const state = {
      payCardFeatureTour: { hasSeenFeatureTour: true },
      payCardBalance: { balanceFilter: "ethereum/erc20/usd__coin" },
      payCardLoginIntro: { hasSeenLoginIntro: true },
    } as unknown as State;

    const projected = payCardPersistedSelector(state);

    expect(projected).toEqual({
      hasSeenFeatureTour: true,
      balanceFilter: "ethereum/erc20/usd__coin",
      hasSeenLoginIntro: true,
    });
  });
});

describe("payCardDbSaveSliceSelector (mobile save trigger)", () => {
  const base = {
    payCardFeatureTour: { hasSeenFeatureTour: false },
    payCardBalance: { balanceFilter: "all" },
    payCardLoginIntro: { hasSeenLoginIntro: false },
  } as unknown as State;

  it("holds its identity while no pay card slice changes", () => {
    expect(payCardDbSaveSliceSelector(base)).toBe(payCardDbSaveSliceSelector(base));
  });

  it.each(["payCardFeatureTour", "payCardBalance", "payCardLoginIntro"] as const)(
    "re-triggers the save when only %s changes",
    slice => {
      // A slice missing from the selector inputs would return the same object here, the effect
      // would not re-run, and the flag would never reach disk.
      const next = { ...base, [slice]: {} } as unknown as State;

      expect(payCardDbSaveSliceSelector(next)).not.toBe(payCardDbSaveSliceSelector(base));
    },
  );
});
