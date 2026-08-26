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
import { NavigatorName, ScreenName } from "~/const";
import { navigationRef } from "~/rootnavigation";
import { useDevToolsRelay } from "./useDevToolsRelay";

export function useDevToolsScreenViewModel() {
  const featureFlagsProps = useFeatureFlagsToolProps();

  /**
   * Leaves DevTools and lands on the Pay tab, so a tester can sign in without walking back through
   * Settings. A reset rather than a navigate: DevTools sits inside the Settings stack.
   */
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

  const payCardToolProps = usePayCardToolProps({ platform: "native", openPayTab });
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
