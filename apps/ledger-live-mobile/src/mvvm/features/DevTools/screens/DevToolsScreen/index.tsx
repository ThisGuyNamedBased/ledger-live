import React from "react";
import { useRoute, type RouteProp } from "@react-navigation/native";
import { DevTools } from "@devtools/shell";
import { TransportPanel } from "@devtools/transport-panel";
import type { SettingsNavigatorStackParamList } from "~/components/RootNavigator/types/SettingsNavigator";
import type { ScreenName } from "~/const";
import { useDevToolsScreenViewModel } from "./useDevToolsScreenViewModel";

export default function DevToolsScreen() {
  const { config, screenOptions, transport, hubUrl, setHubUrl, role } =
    useDevToolsScreenViewModel();
  const { params } =
    useRoute<RouteProp<SettingsNavigatorStackParamList, ScreenName.DebugDevTools>>();

  return (
    <DevTools
      config={config}
      initialToolId={params?.toolId}
      screenOptions={screenOptions}
      footer={
        <TransportPanel transport={transport} hubUrl={hubUrl} setHubUrl={setHubUrl} role={role} />
      }
    />
  );
}
