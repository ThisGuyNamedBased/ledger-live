import { useCallback, useEffect, useRef, useState } from "react";
import { useDispatch } from "react-redux";
import { cardSession, readCardSession, refreshCardSession } from "@features/platform-card";
import { cardApi } from "@shared/api-services";
import type { DevToolsConfig } from "@devtools/registry";

type PayCardToolProps = Extract<DevToolsConfig[number], { id: "pay-card" }>["config"];
type PayCardAuthProps = NonNullable<PayCardToolProps["auth"]>;
type SessionSnapshot = NonNullable<PayCardAuthProps["session"]>;
type ActionResult = NonNullable<PayCardAuthProps["lastResult"]>;

/**
 * The mocked provider's switchboard, published on `globalThis` by the host app's MSW handler.
 *
 * Read structurally rather than imported: the handler lives in the app, which this package cannot
 * import, and `msw` is a devDependency that must never reach a production bundle.
 */
type CardMockState = {
  tokenResponse: string;
  readonly responses: readonly { id: string; label: string; hint: string }[];
  userUnauthorizedOnce: boolean;
  refreshCount: number;
};

function readMockState(): CardMockState | undefined {
  return (globalThis as { payCardMockState?: CardMockState }).payCardMockState;
}

/**
 * `@domain/api-card-management` injects its endpoints into this very object, so they are here at
 * runtime. This package does not depend on it, and must not start to for a debug panel.
 */
type CardQuery = {
  initiate: (
    arg: undefined,
    options: { forceRefetch: boolean; subscribe: boolean },
  ) => (dispatch: unknown) => Promise<unknown>;
};
type CardEndpoints = { endpoints: { getUser?: CardQuery; getCardStatus?: CardQuery } };

// eslint-disable-next-line @typescript-eslint/consistent-type-assertions
const cardEndpoints = cardApi as unknown as CardEndpoints;

const VISIBLE_TOKEN_CHARS = 9;

/** Enough of a token to see it change, never the whole credential. */
function mask(token: string | null): string {
  if (!token) return "null";
  const visibleLength = Math.min(VISIBLE_TOKEN_CHARS, Math.max(0, token.length - 1));
  return `${token.slice(0, visibleLength)}…`;
}

/**
 * Builds the Card session controls for the Card / Pay DevTool.
 *
 * Every action calls the real accessors from `@features/platform-card`, so the panel exercises the
 * code the app ships rather than a copy of it. The mocked provider is optional: without it the
 * actions still run, and reach the real provider instead.
 */
export type UsePayCardAuthPropsOptions = {
  /** Supplied by the host, because navigation is app-specific. */
  readonly openPayTab?: () => void;
};

export function usePayCardAuthProps(options: UsePayCardAuthPropsOptions = {}): PayCardAuthProps {
  const dispatch = useDispatch();
  const [session, setSession] = useState<SessionSnapshot | null>(null);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [, setMockTick] = useState(0);
  const mounted = useRef(true);
  const resultId = useRef(0);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const readSession = useCallback(async () => {
    try {
      const current = await cardSession.get();
      if (mounted.current) {
        setSession(current);
        setSessionError(null);
      }
      return current;
    } catch (error) {
      // The store refused the read. That is not an empty store, and the panel says so rather than
      // reporting the tester as signed out.
      if (mounted.current) {
        setSession(null);
        setSessionError(error instanceof Error ? error.message : String(error));
      }
      return null;
    }
  }, []);

  const nextResultId = useCallback(() => {
    resultId.current += 1;
    return resultId.current;
  }, []);

  /** Runs one action, reports what it answered, and re-reads the session it may have changed. */
  const run = useCallback(
    (label: string, action: () => Promise<string>) => {
      setBusy(true);
      void (async () => {
        let outcome: Omit<ActionResult, "id">;
        try {
          outcome = { message: `${label} → ${await action()}`, failed: false };
        } catch (error) {
          outcome = {
            message: `${label} failed: ${error instanceof Error ? error.message : String(error)}`,
            failed: true,
          };
        }

        await readSession();
        if (!mounted.current) return;
        setLastResult({ id: nextResultId(), ...outcome });
        setMockTick(tick => tick + 1);
        setBusy(false);
      })();
    },
    [nextResultId, readSession],
  );

  useEffect(() => {
    void readSession();
  }, [readSession]);

  const readTokens = useCallback(() => {
    run("get auth tokens", async () => "read from the keychain");
  }, [run]);

  const renewNow = useCallback(() => {
    run("renew", async () => {
      const { sessionId, token } = await readCardSession();
      if (!token) return "no session";
      const result = await refreshCardSession(sessionId, token);
      if (result.kind === "refreshed") return `refreshed ${mask(result.accessToken)}`;
      return result.kind;
    });
  }, [run]);

  const breakAccessToken = useCallback(() => {
    run("break access token", async () => {
      const current = await cardSession.get();
      if (!current) return "no session";
      // The first character, not the last: the panel shows the front of the token, so this is the
      // half a tester can see change.
      const first = current.accessToken.slice(0, 1);
      await cardSession.set({
        accessToken: (first === "X" ? "Y" : "X") + current.accessToken.slice(1),
        refreshToken: current.refreshToken,
      });
      return "the next request must answer 401 and renew";
    });
  }, [run]);

  const breakRefreshToken = useCallback(() => {
    run("break refresh token", async () => {
      const current = await cardSession.get();
      if (!current) return "no session";
      // The first character, as with the access token above: the panel shows the front of the
      // token, so this is the half a tester can see change. Where the change lands no longer
      // matters — every answer but a new session ends the session, so a malformed token and a
      // rejected grant reach the same place.
      const first = current.refreshToken.slice(0, 1);
      await cardSession.set({
        accessToken: current.accessToken,
        refreshToken: (first === "X" ? "Y" : "X") + current.refreshToken.slice(1),
      });
      return "the next renewal must end the session";
    });
  }, [run]);

  const clearSession = useCallback(() => {
    run("clear", async () => {
      await cardSession.clear();
      return "cleared";
    });
  }, [run]);

  const burst = useCallback(
    (callers: number) => {
      run(`burst ${callers}`, async () => {
        const before = readMockState()?.refreshCount;
        const { sessionId, token } = await readCardSession();
        if (!token) return "no session";
        // Renewals, not reads: a read never renews now, so only this measures single flight.
        const results = await Promise.all(
          Array.from({ length: callers }, () => refreshCardSession(sessionId, token)),
        );
        const after = readMockState()?.refreshCount;
        const renewals = before === undefined || after === undefined ? "?" : after - before;
        const tokens = new Set(
          results.map(result => (result.kind === "refreshed" ? result.accessToken : result.kind)),
        );
        return `${tokens.size} distinct answer(s), ${renewals} renewal(s)`;
      });
    },
    [run],
  );

  const fetchUser = useCallback(() => {
    run("get user", async () => {
      const getUser = cardEndpoints.endpoints.getUser;
      if (!getUser) return "unavailable (endpoint not registered)";

      const result = (await dispatch(
        // eslint-disable-next-line @typescript-eslint/consistent-type-assertions
        getUser.initiate(undefined, {
          forceRefetch: true,
          subscribe: false,
        }) as never,
      )) as { error?: unknown };
      return result?.error ? "failed" : "ok";
    });
  }, [dispatch, run]);

  const mockState = readMockState();
  const setResponse = useCallback((id: string) => {
    const state = readMockState();
    if (state) state.tokenResponse = id;
    setMockTick(tick => tick + 1);
  }, []);

  const resetRenewals = useCallback(() => {
    const state = readMockState();
    if (state) state.refreshCount = 0;
    setMockTick(tick => tick + 1);
  }, []);

  const armUnauthorized = useCallback(() => {
    const state = readMockState();
    if (state) state.userUnauthorizedOnce = true;
    setLastResult({
      id: nextResultId(),
      message: "the next user call answers 401",
      failed: false,
    });
  }, [nextResultId]);

  return {
    session,
    sessionError,
    busy,
    lastResult,
    readTokens,
    renewNow,
    breakAccessToken,
    breakRefreshToken,
    clearSession,
    burst,
    fetchUser,
    openPayTab: options.openPayTab,
    mock: {
      available: mockState !== undefined,
      response: mockState?.tokenResponse ?? "pass",
      responses: mockState?.responses ?? [],
      setResponse,
      renewals: mockState?.refreshCount ?? 0,
      resetRenewals,
      armUnauthorized,
    },
  };
}
