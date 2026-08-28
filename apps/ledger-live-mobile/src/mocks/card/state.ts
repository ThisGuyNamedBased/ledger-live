/**
 * The switchboard the Pay Card MSW handler reads and the DevTools panel drives.
 *
 * It lives on `globalThis` rather than in a module both sides import: the panel's props are built in
 * `@devtools/bindings`, which cannot import from an app, and this file's neighbour pulls in `msw`, a
 * devDependency that must never reach a production bundle. This file imports nothing.
 */

/**
 * What the mocked `POST /v1/auth/oauth2/token` answers.
 *
 * One entry per documented response of the Baanx endpoint, named by its status code so a tester can
 * match the panel against the API reference without translating a nickname. `pass` is the only
 * entry that is not an answer: it lets the real provider reply.
 *
 * The three transport cases have no status of their own, so they say what they do.
 */
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
  /** The button's text. */
  readonly label: string;
  /** One line, shown while this answer is chosen. */
  readonly hint: string;
};

/**
 * The order the panel shows them in: the real provider, then the successes, then the failures by
 * rising status, then the failure that has no status at all.
 */
export const CARD_TOKEN_RESPONSES: readonly CardTokenResponse[] = [
  {
    id: "pass",
    label: "Off",
    hint: "The mock stands aside. The real provider answers the renewal.",
  },
  {
    id: "200",
    label: "200",
    hint: "Token exchange successful. A new access token and a new refresh token. The session renews.",
  },
  {
    id: "200-slow",
    label: "200 slow",
    hint: "The same body, 5 s later. Holds one renewal open so every waiting caller must share it.",
  },
  {
    id: "200-bad-body",
    label: "200 bad body",
    hint: "200 with no refresh_token. The wire schema rejects it, and the session must survive.",
  },
  {
    id: "400",
    label: "400",
    hint: "OAuth 2.0 error (RFC 6749): invalid_grant. The session must end and the login screen must return.",
  },
  {
    id: "422",
    label: "422",
    hint: "Data validation error. The session must survive.",
  },
  {
    id: "498",
    label: "498",
    hint: "Invalid x-client-key header. The session must survive.",
  },
  {
    id: "499",
    label: "499",
    hint: "Missing x-client-key header. The session must survive.",
  },
  {
    id: "500",
    label: "500",
    hint: "Internal server error. The session must survive.",
  },
  {
    id: "network-error",
    label: "Network fail",
    hint: "No answer at all. The client cannot know whether Baanx consumed the refresh token.",
  },
];

export type CardMockState = {
  tokenResponse: CardTokenResponseId;
  /** Published so the panel can list the answers without knowing what they are. */
  readonly responses: readonly CardTokenResponse[];
  /** Answers the next `GET /v1/user` with a 401, then clears itself. */
  userUnauthorizedOnce: boolean;
  /**
   * The renewals the mock answered.
   *
   * Answered, not seen. A handler runs twice for a request it passes through, so a counter that
   * covered `pass` as well would report two renewals for one. See COUNTING in `handler.ts`.
   */
  refreshCount: number;
};

type MockHost = { payCardMockState?: CardMockState };

/** Absent unless the app started with `MSW_ENABLED=true`. */
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
