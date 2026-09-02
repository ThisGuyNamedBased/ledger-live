import React from "react";
import { StyleSheet } from "react-native";
import Animated, { FadeIn } from "react-native-reanimated";
import { Box, TileButton } from "@ledgerhq/lumen-ui-rnative";
import { HINT_ENTER_MS } from "./RequestReceiveVerifyHint.native";
import { useRequestReceiveActions } from "./useRequestReceiveActions.native";
import type { RequestReceiveActionId, RequestReceiveActionLabels } from "../../types";

const TILE_DIM = { backgroundColor: "rgba(0,0,0,0.4)" } as const;

type RequestReceiveActionsProps = Readonly<{
  labels: RequestReceiveActionLabels;
  visibleActions: readonly RequestReceiveActionId[];
  hasCopied: boolean;
  onShare: () => void;
  onCopy: () => void;
  onSave: () => void;
  onVerify: () => void;
  dimOtherActions?: boolean;
}>;

export function RequestReceiveActions(props: RequestReceiveActionsProps) {
  const { dimOtherActions } = props;
  const tiles = useRequestReceiveActions(props);

  return (
    <Box lx={{ flexDirection: "row", gap: "s8", width: "full" }}>
      {tiles.map(tile => (
        <Box key={tile.id} lx={{ flex: 1 }}>
          <TileButton
            lx={{ width: "full" }}
            icon={tile.icon}
            onPress={dimOtherActions && tile.id !== "verify" ? undefined : tile.onClick}
            testID={tile.testId}
            accessibilityLabel={tile.label}
            isFull
          >
            {tile.label}
          </TileButton>
          {dimOtherActions && tile.id !== "verify" ? (
            <Animated.View
              entering={FadeIn.duration(HINT_ENTER_MS)}
              pointerEvents="auto"
              style={[StyleSheet.absoluteFill, TILE_DIM]}
            />
          ) : null}
        </Box>
      ))}
    </Box>
  );
}
