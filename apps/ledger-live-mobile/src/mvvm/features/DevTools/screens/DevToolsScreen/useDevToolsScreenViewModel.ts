import { useCallback, useMemo } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackNavigationOptions } from "@react-navigation/native-stack";
import { useTheme } from "@ledgerhq/lumen-ui-rnative/styles";
import { getStackNavigationConfigV4 } from "LLM/components/Navigation";
import {
  useFeatureFlagsToolProps,
  usePayCardToolProps,
  useEnvDevToolProps,
} from "@devtools/bindings";
import type { DevToolsConfig } from "@devtools/shell";
import { openHostedLoginInSecureBrowser } from "@features/flow-pay-card-auth";
import { NavigatorName, ScreenName } from "~/const";
import { navigationRef } from "~/rootnavigation";
import { PAY_TAB_DEEP_LINK } from "~/navigation/deeplinks/payTabDeepLink";
import { useDevToolsRelay } from "./useDevToolsRelay";

export function useDevToolsScreenViewModel() {
  const featureFlagsProps = useFeatureFlagsToolProps();

  const openPayTab = useCallback(() => {
    navigationRef.current?.reset({
      index: 0,
      routes: [
        {
          name: NavigatorName.Main,
          state: {
            routes: [
              {
                name: NavigatorName.PayTab,
                state: { routes: [{ name: ScreenName.PayTab }] },
              },
            ],
          },
        },
      ],
    });
  }, []);

  const openSecureBrowser = useCallback(async (url: string) => {
    const result = await openHostedLoginInSecureBrowser(url, PAY_TAB_DEEP_LINK);
    return result.type === "success" ? `redirected to ${result.url}` : "dismissed";
  }, []);

  const payCardToolProps = usePayCardToolProps({
    platform: "native",
    openPayTab,
    openSecureBrowser,
  });
  const envToolProps = useEnvDevToolProps();
  const { theme } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { wire, wireState } = useDevToolsRelay();

  const config: DevToolsConfig = useMemo(
    () => [
      { id: "feature-flags", config: featureFlagsProps },
      { id: "env", config: envToolProps },
      { id: "pay-card", config: payCardToolProps },
    ],
    [featureFlagsProps, envToolProps, payCardToolProps],
  );

  const screenOptions: NativeStackNavigationOptions = useMemo(() => {
    const navConfig = getStackNavigationConfigV4(theme);
    return {
      ...navConfig,
      contentStyle: [navConfig.contentStyle, { paddingBottom: bottom }],
    };
  }, [theme, bottom]);

  return {
    config,
    screenOptions,
    transport: wire.transport,
    hubUrl: wireState.hubUrl,
    setHubUrl: wire.setHubUrl,
    role: wireState.role,
  };
}
