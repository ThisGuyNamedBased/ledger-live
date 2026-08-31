import { http, HttpResponse, passthrough, delay } from "msw";
import { createCardMockState } from "./state";

const state = createCardMockState();

/** Long enough to hold a renewal open while several screens ask for the same token. */
const SLOW_MS = 5_000;

/**
 * Marks everything this file issues. Once a renewal has rotated the session, the stored tokens are
 * mock ones. The provider would reject them, so the reads below answer from the mock too, and only
 * a fresh login makes `Off` safe again.
 */
const MOCK_TOKEN_PREFIX = "at_mock_";

/** The provider never issued a mocked access token, so it would answer 401 for one. */
function usesMockToken(request: Request): boolean {
  return request.headers.get("authorization")?.includes(MOCK_TOKEN_PREFIX) ?? false;
}

const MOCK_USER = {
  id: "6f1c9a52-3d4e-4b7a-9c81-2f0d5e7a1b34",
  verificationState: "VERIFIED",
};

const MOCK_CARD_STATUS = {
  id: "000000000050277836",
  holderName: "JOHN DOE",
  expiryDate: "2028/01",
  panLast4: "1234",
  status: "ACTIVE",
  type: "VIRTUAL",
  orderedAt: "2023-03-27T17:07:12.662Z",
};

/**
 * The documented 200: a whole new session, so the renewal loop runs without a live Baanx account.
 *
 * `id_token`, `scope` and `token_type` are in the reference too. They are left out because the wire
 * schema ignores them, and a body that carries what nothing reads teaches a tester the wrong thing.
 */
function rotatedSession(serial: number) {
  return HttpResponse.json({
    access_token: `${MOCK_TOKEN_PREFIX}${serial}`,
    refresh_token: `rt_mock_${serial}`,
    expires_in: 3600,
  });
}

/**
 * The documented 400 body (RFC 6749).
 *
 * `invalid_grant` is the value the refresh grant returns for a spent or revoked refresh token. The
 * other seven values in the reference reach the same place, because the client classifies a renewal
 * failure on the status alone and never reads the body.
 */
const OAUTH_ERROR_BODY = {
  error: "invalid_grant",
  error_description: "The refresh token is invalid, expired or revoked",
};

/**
 * Every answer the token endpoint can give, keyed exactly as the panel's buttons are.
 *
 * Each status carries the body the Baanx reference documents for it, so a tester reads the same
 * shape here and there.
 */
async function answerTokenRequest(id: string, serial: number) {
  switch (id) {
    case "200":
      return rotatedSession(serial);

    case "200-slow":
      // Holds the renewal open so concurrent callers must share it, then answers as 200 does. It
      // must not pass through: the stored refresh token is a mock one by this point.
      await delay(SLOW_MS);
      return rotatedSession(serial);

    case "200-bad-body":
      // No `refresh_token`, so the wire schema rejects it and the session ends.
      return HttpResponse.json({ access_token: `${MOCK_TOKEN_PREFIX}${serial}`, expires_in: 3600 });

    case "400":
      // Terminal. The session must end and the login screen must come back.
      return HttpResponse.json(OAUTH_ERROR_BODY, { status: 400 });

    case "422":
      return HttpResponse.json({ message: "x field is not allowed" }, { status: 422 });

    case "498":
      return HttpResponse.json({ message: "Invalid client key" }, { status: 498 });

    case "499":
      return HttpResponse.json({ message: "Missing client key" }, { status: 499 });

    case "500":
      return HttpResponse.json({ message: "Internal server error" }, { status: 500 });

    case "network-error":
      // A transport failure. The client cannot tell whether Baanx consumed the refresh token, so
      // this is the answer that proves one request never spends it twice.
      return HttpResponse.error();

    default:
      return passthrough();
  }
}

/**
 * COUNTING — a handler runs twice for every request it passes through.
 *
 * `msw/native` installs two interceptors, one on `fetch` and one on `XMLHttpRequest`. React Native's
 * `fetch` is `whatwg-fetch`, which is built on `XMLHttpRequest`. So a request this file passes
 * through is performed with the real `fetch`, that `fetch` opens an `XMLHttpRequest`, and the second
 * interceptor hands the same request back here.
 *
 * A request this file answers never reaches the real `fetch`, so it arrives once.
 *
 * `refreshCount` is therefore incremented only where the mock answers. Nothing counts a pass-through,
 * because a pass-through cannot be counted here without counting it twice. The `[card api]` trace in
 * `@shared/api-services` runs in the client, once per request, and is the place that counts them.
 */
const handlers = [
  /**
   * Both OAuth2 grants share this URL. Only the renewal is mocked: intercepting the
   * `authorization_code` grant would stop anybody signing in.
   */
  http.post("*/v1/auth/oauth2/token", async ({ request }) => {
    const body = (await request
      .clone()
      .json()
      .catch(() => ({}))) as { grant_type?: string };

    if (body.grant_type !== "refresh_token") {
      return passthrough();
    }

    // Answered, or passed through, before anything is counted. See COUNTING above.
    if (state.tokenResponse === "pass") {
      return passthrough();
    }

    state.refreshCount += 1;
    // eslint-disable-next-line no-console
    console.log(`[card-msw] renewal #${state.refreshCount} answers ${state.tokenResponse}`);

    return answerTokenRequest(state.tokenResponse, state.refreshCount);
  }),

  /** Drives the reactive path on demand, with no waiting for a real expiry. */
  http.get("*/v1/user", ({ request }) => {
    if (state.userUnauthorizedOnce) {
      state.userUnauthorizedOnce = false;
      // eslint-disable-next-line no-console
      console.log("[card-msw] answering one /v1/user with 401");
      return HttpResponse.json({ message: "unauthorized" }, { status: 401 });
    }

    if (!usesMockToken(request)) {
      return passthrough();
    }

    // eslint-disable-next-line no-console
    console.log("[card-msw] answering /v1/user from the mock");
    return HttpResponse.json(MOCK_USER);
  }),

  http.get("*/v1/card/status", ({ request }) => {
    if (!usesMockToken(request)) {
      return passthrough();
    }
    return HttpResponse.json(MOCK_CARD_STATUS);
  }),
];

export default handlers;
