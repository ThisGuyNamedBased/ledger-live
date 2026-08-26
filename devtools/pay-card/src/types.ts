/**
 * Feature-flag controls surfaced by the tool.
 *
 * `payTabEnabled` drives the Pay tab flag (`lwdPayTab` / `lwmPayTab`) and
 * `cardParam` its `params.card` sub-flag; `ptxCardEnabled` drives the legacy
 * `ptxCard` flag.
 */
export interface PayCardFlagsProps {
  readonly payTabEnabled: boolean;
  readonly cardParam: boolean;
  readonly ptxCardEnabled: boolean;
  readonly setPayTabEnabled: (value: boolean) => void;
  readonly setCardParam: (value: boolean) => void;
  readonly setPtxCardEnabled: (value: boolean) => void;
}

/** A single Card onboarding step that can be marked done or not. */
export interface OnboardingStep {
  readonly id: string;
  readonly label: string;
  readonly done: boolean;
}

/**
 * Card onboarding controls.
 *
 * Exposes the onboarding steps so each one can be toggled done/not-done to
 * force the app into a given point of the onboarding flow.
 */
export interface PayCardOnboardingProps {
  readonly steps: readonly OnboardingStep[];
  readonly setStepDone: (id: string, done: boolean) => void;
}

/** The stored Card session, as the panel shows it. */
export interface PayCardSessionSnapshot {
  readonly accessToken: string;
  readonly refreshToken: string;
}

/**
 * One answer the mocked token endpoint can give, as the panel shows it.
 *
 * The mock supplies the label and the hint, so the tool never has to know what a status means.
 */
export interface PayCardMockResponse {
  readonly id: string;
  /** The button's text. A status code, where the answer has one. */
  readonly label: string;
  /** One line, shown while this answer is chosen. */
  readonly hint: string;
}

/**
 * The mocked provider, when one is running.
 *
 * The tool picks what `POST /v1/auth/oauth2/token` answers. The choices are named by status code,
 * so a tester can match a button against the Baanx API reference.
 */
export interface PayCardRenewalMockProps {
  readonly available: boolean;
  /** The id of the chosen answer. */
  readonly response: string;
  readonly responses: readonly PayCardMockResponse[];
  readonly setResponse: (id: string) => void;
  readonly renewals: number;
  readonly userRequests: number;
  readonly resetCounts: () => void;
  /** Makes the next user request answer 401, which drives the renewal a failure triggers. */
  readonly armUnauthorized: () => void;
}

/** What one action answered. The id changes on every action, even when the message repeats. */
export interface PayCardActionResult {
  readonly id: number;
  readonly message: string;
  readonly failed: boolean;
}

/**
 * Card session controls.
 *
 * Every action calls the real session accessors, so what the panel exercises is what the app ships.
 * Actions that need the mocked provider still run without it; they just reach the real one.
 */
export interface PayCardAuthProps {
  readonly session: PayCardSessionSnapshot | null;
  /** True while an action is running, so the panel can disable its buttons. */
  readonly busy: boolean;
  /** What the last action reported. The panel shows it as a banner. */
  readonly lastResult: PayCardActionResult | null;
  /** Re-reads both tokens from the keychain. No network, and it never renews. */
  readonly readTokens: () => void;
  /** Calls the renewal directly, the way a 401 does. */
  readonly renewNow: () => void;
  /**
   * Changes one character of the access token, so the next request answers 401 and the renewal runs.
   * The only way to start a renewal, since nothing renews ahead of a failure.
   */
  readonly breakAccessToken: () => void;
  /** Changes one character of the refresh token, so the provider rejects the next renewal. */
  readonly breakRefreshToken: () => void;
  readonly clearSession: () => void;
  /** Asks for several renewals at once. One attempt must serve them all. */
  readonly burst: (callers: number) => void;
  /** Forces one real user request, ignoring the cache. */
  readonly fetchUser: () => void;
  /**
   * Sends the tester to the Pay tab to sign in. Absent on hosts that cannot navigate, so the panel
   * only offers it when the host built one.
   */
  readonly openPayTab?: () => void;
  readonly mock: PayCardRenewalMockProps;
}

/**
 * One env var the tool shows, with the value a tester most often wants next.
 *
 * The app reads the two Card env vars on every request, so a value set here applies without a
 * restart. Nothing saves it: after a restart the app reads the build's value again.
 */
export interface PayCardEnvVar {
  readonly key: string;
  /** The value the app reads right now. */
  readonly value: string;
  /** What the input starts with, so one press is enough to change the tenant. */
  readonly suggestedValue: string;
}

/** The Card env vars the tool reads, and the one way it changes them. */
export interface PayCardEnvProps {
  readonly vars: readonly PayCardEnvVar[];
  readonly setVar: (key: string, value: string) => void;
}

/**
 * Props contract for the Card / Pay DevTool.
 *
 * Built by `@devtools/bindings` (`usePayCardToolProps`) from the host's Redux
 * state and actions. The component never reads app state directly.
 */
export interface PayCardToolProps {
  readonly flags: PayCardFlagsProps;
  readonly onboarding: PayCardOnboardingProps;
  /** Whether the user has already seen the Pay feature tour. */
  readonly hasSeenFeatureTour: boolean;
  /** Resets the feature tour so it plays again on the next Pay visit. */
  readonly resetPayCardFeatureTourSeen: () => void;
  /** The Card backend env vars, read live and set from the tool. */
  readonly env: PayCardEnvProps;
  /** Card session controls. Absent on hosts that do not build them yet. */
  readonly auth?: PayCardAuthProps;
}
