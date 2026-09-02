import { NavigatorName, ScreenName } from "~/const";
import { navigateToPayTab } from "../navigateToPayTab";

describe("navigateToPayTab", () => {
  it("should replace to the Pay tab screen", () => {
    const replace = jest.fn();

    navigateToPayTab({ replace });

    expect(replace).toHaveBeenCalledWith(NavigatorName.Main, {
      screen: NavigatorName.PayTab,
      params: { screen: ScreenName.PayTab },
    });
  });
});
