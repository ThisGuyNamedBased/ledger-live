import React from "react";
import { DevTools } from "@devtools/shell";
import { TransportPanel } from "@devtools/transport-panel";
import { useDevToolsScreenViewModel } from "./useDevToolsScreenViewModel";

export default function DevToolsScreen() {
  const { config, initialToolId, screenOptions, transport, hubUrl, setHubUrl, role } =
    useDevToolsScreenViewModel();

  return (
    <DevTools
      config={config}
      initialToolId={initialToolId}
      screenOptions={screenOptions}
      footer={
        <TransportPanel transport={transport} hubUrl={hubUrl} setHubUrl={setHubUrl} role={role} />
      }
    />
  );
}
