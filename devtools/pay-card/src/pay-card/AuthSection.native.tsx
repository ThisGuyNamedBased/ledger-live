import { Box, Button, Text, Tag } from "@ledgerhq/lumen-ui-rnative";
import type { PayCardAuthProps } from "../types";
import { Section } from "../components/Section/Section";

const ROW = { flexDirection: "row", flexWrap: "wrap", gap: 8, alignItems: "center" } as const;
const FIELD = { flexDirection: "row", gap: 4, alignItems: "center" } as const;

const VISIBLE_TOKEN_CHARS = 9;

/** Enough of a token to see it change, never the whole credential. */
function mask(token: string): string {
  return token.length <= VISIBLE_TOKEN_CHARS ? token : `${token.slice(0, VISIBLE_TOKEN_CHARS)}…`;
}

/** Muted label, readable value. Text with no colour is invisible on the panel's background. */
function Field({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <Box style={FIELD}>
      <Text typography="body4" lx={{ color: "muted" }}>
        {label}
      </Text>
      <Text typography="body4" lx={{ color: "base" }}>
        {value}
      </Text>
    </Box>
  );
}

export function AuthSection({ auth }: { readonly auth: PayCardAuthProps }) {
  const { session, sessionError, mock, busy } = auth;

  /** Says at a glance who answers these calls: the mock, or the real provider. */
  const requestLabel = (label: string) => (mock.available ? `[MSW] ${label}` : label);

  /** The chosen answer, so the panel can explain it in one line under the grid. */
  const chosen = mock.responses.find(response => response.id === mock.response);

  return (
    <>
      <Section title="Auth session">
        {sessionError !== null ? (
          <Box style={ROW}>
            {/* A store that refused a read holds no answer either way. Saying "No session" here
                would send a tester to the login screen over a locked keychain. */}
            <Tag size="sm" appearance="error" label="Unreadable" />
            <Text typography="body4" lx={{ color: "muted" }}>
              {sessionError}
            </Text>
          </Box>
        ) : session ? (
          <Box style={ROW}>
            <Tag size="sm" appearance="success" label="Live" />
            <Field label="access" value={mask(session.accessToken)} />
            <Field label="refresh" value={mask(session.refreshToken)} />
          </Box>
        ) : (
          <Box style={ROW}>
            <Tag size="sm" appearance="gray" label="No session" />
            <Text typography="body4" lx={{ color: "muted" }}>
              Sign in to the Pay tab first.
            </Text>
          </Box>
        )}

        {!session && sessionError === null && auth.openPayTab ? (
          <Box style={ROW}>
            <Button appearance="accent" size="sm" onPress={auth.openPayTab}>
              Go to the Pay tab
            </Button>
          </Box>
        ) : null}
      </Section>

      <Section title="Device secure storage">
        <Box style={ROW}>
          <Button appearance="gray" size="sm" disabled={busy} onPress={auth.readTokens}>
            Get auth tokens
          </Button>
          <Button appearance="gray" size="sm" disabled={busy} onPress={auth.breakAccessToken}>
            Break access token
          </Button>
          <Button appearance="gray" size="sm" disabled={busy} onPress={auth.breakRefreshToken}>
            Break refresh token
          </Button>
          <Button appearance="red" size="sm" disabled={busy} onPress={auth.clearSession}>
            Clear session
          </Button>
        </Box>
        <Text typography="body4" lx={{ color: "muted" }}>
          Reads and writes the keychain only. A renewal starts when the provider answers 401, so
          break the access token to cause one.
        </Text>
      </Section>

      <Section title="Send API requests">
        <Box style={ROW}>
          <Button appearance="gray" size="sm" disabled={busy} onPress={auth.renewNow}>
            {requestLabel("Renew now")}
          </Button>
          <Button appearance="gray" size="sm" disabled={busy} onPress={auth.fetchUser}>
            {requestLabel("Get user")}
          </Button>
          <Button appearance="gray" size="sm" disabled={busy} onPress={() => auth.burst(5)}>
            {requestLabel("Burst 5 callers")}
          </Button>
        </Box>
      </Section>

      <Section title="MSW Auth Renewal Mock">
        <Box style={ROW}>
          <Tag
            size="sm"
            appearance={mock.available ? "success" : "gray"}
            label={mock.available ? "MSW running" : "MSW off"}
          />
          <Text typography="body4" lx={{ color: "base" }}>
            {`renewals ${mock.renewals}`}
          </Text>
        </Box>

        {mock.available ? (
          <>
            <Text typography="body4" lx={{ color: "muted" }}>
              What POST /v1/auth/oauth2/token answers:
            </Text>
            <Box style={ROW}>
              {mock.responses.map(response => (
                <Button
                  key={response.id}
                  appearance={response.id === mock.response ? "accent" : "gray"}
                  size="sm"
                  onPress={() => mock.setResponse(response.id)}
                >
                  {response.label}
                </Button>
              ))}
            </Box>
            {chosen ? (
              <Text typography="body4" lx={{ color: "muted" }}>
                {chosen.hint}
              </Text>
            ) : null}
          </>
        ) : (
          <Text typography="body4" lx={{ color: "muted" }}>
            Start with `pnpm mobile start:msw` to choose what the provider answers.
          </Text>
        )}

        <Box style={ROW}>
          <Button
            appearance="gray"
            size="sm"
            disabled={!mock.available}
            onPress={mock.resetRenewals}
          >
            Reset renewals
          </Button>
          <Button
            appearance="gray"
            size="sm"
            disabled={!mock.available}
            onPress={mock.armUnauthorized}
          >
            Next user call → 401
          </Button>
        </Box>
      </Section>
    </>
  );
}
