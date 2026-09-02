import type { NavigationProp, ParamListBase } from "@react-navigation/native";
import { NavigatorName, ScreenName } from "~/const";

export function navigateToPayTab(navigation: Pick<NavigationProp<ParamListBase>, "replace">): void {
  navigation.replace(NavigatorName.Main, {
    screen: NavigatorName.PayTab,
    params: { screen: ScreenName.PayTab },
  });
}
