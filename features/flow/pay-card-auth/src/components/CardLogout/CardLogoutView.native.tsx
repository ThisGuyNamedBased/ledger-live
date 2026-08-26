import React from "react";
import { Pressable } from "react-native";
import { Box, Button, Text } from "@ledgerhq/lumen-ui-rnative";
import type { CardLogoutViewProps } from "./types";

const PRESSABLE_STYLE = { flex: 1, minWidth: 0 } as const;

export function CardLogoutView({
  title,
  idLabel,
  userId,
  verificationLabel,
  verificationValue,
  logoutLabel,
  isLoading,
  onLogoutPress,
  onInspectSession,
}: CardLogoutViewProps) {
  const details = (
    <Box lx={{ flex: 1, flexDirection: "column", gap: "s4" }} style={{ minWidth: 0 }}>
      <Text typography="heading5SemiBold" lx={{ color: "base" }}>
        {title}
      </Text>
      <Text typography="body3" lx={{ color: "muted" }}>
        {idLabel}: {userId}
      </Text>
      <Text typography="body3" lx={{ color: "muted" }}>
        {verificationLabel}: {verificationValue}
      </Text>
    </Box>
  );

  return (
    <Box
      lx={{
        flexDirection: "row",
        alignItems: "center",
        gap: "s16",
        paddingTop: "s16",
      }}
    >
      {onInspectSession ? (
        <Pressable
          onPress={onInspectSession}
          accessibilityRole="button"
          accessibilityLabel={`${title}. ${idLabel}: ${userId}`}
          style={PRESSABLE_STYLE}
        >
          {details}
        </Pressable>
      ) : (
        details
      )}
      <Button
        appearance="gray"
        size="md"
        loading={isLoading}
        disabled={isLoading}
        onPress={onLogoutPress}
        accessibilityLabel={logoutLabel}
      >
        {logoutLabel}
      </Button>
    </Box>
  );
}
