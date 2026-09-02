export type CardTokenResponseId =
  | "pass"
  | "200"
  | "200-slow"
  | "200-bad-body"
  | "400"
  | "422"
  | "498"
  | "499"
  | "500"
  | "network-error";

export type CardTokenResponse = {
  readonly id: CardTokenResponseId;
  readonly label: string;
  readonly hint: string;
};

export const CARD_TOKEN_RESPONSES: readonly CardTokenResponse[] = [
  {
    id: "pass",
    label: "Off",
    hint: "The mock stands aside. The real provider answers the renewal.",
  },
  {
    id: "200",
    label: "200",
    hint: "Token exchange successful. A new access token and a new refresh token. The one answer that keeps the session.",
  },
  {
    id: "200-slow",
    label: "200 slow",
    hint: "The same body, 5 s later. Holds one renewal open so every waiting caller must share it.",
  },
  {
    id: "200-bad-body",
    label: "200 bad body",
    hint: "200 with no refresh_token. The wire schema rejects it, so no session is stored, so the session ends.",
  },
  {
    id: "400",
    label: "400",
    hint: "OAuth 2.0 error (RFC 6749): invalid_grant. A refresh token the provider will not accept again.",
  },
  {
    id: "422",
    label: "422",
    hint: "Data validation error. Our request was wrong, and the session ends all the same.",
  },
  {
    id: "498",
    label: "498",
    hint: "Invalid x-client-key header. A build fault, and the session ends all the same.",
  },
  {
    id: "499",
    label: "499",
    hint: "Missing x-client-key header. A build fault, and the session ends all the same.",
  },
  {
    id: "500",
    label: "500",
    hint: "Internal server error. A Baanx outage signs the user out. That is the accepted trade.",
  },
  {
    id: "network-error",
    label: "Network fail",
    hint: "No answer at all. The client cannot know whether Baanx consumed the token, and ends the session.",
  },
];

export type CardMockState = {
  tokenResponse: CardTokenResponseId;
  readonly responses: readonly CardTokenResponse[];
  userUnauthorizedOnce: boolean;
  refreshCount: number;
};

type MockHost = { payCardMockState?: CardMockState };

export function readCardMockState(): CardMockState | undefined {
  return (globalThis as MockHost).payCardMockState;
}

export function createCardMockState(): CardMockState {
  const state: CardMockState = {
    tokenResponse: "pass",
    responses: CARD_TOKEN_RESPONSES,
    userUnauthorizedOnce: false,
    refreshCount: 0,
  };
  (globalThis as MockHost).payCardMockState = state;
  return state;
}
