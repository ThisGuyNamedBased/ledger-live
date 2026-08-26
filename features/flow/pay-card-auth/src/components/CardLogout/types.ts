/**
 * What the signed-in card holder sees, and the action that ends the session. The user schema is narrow
 * on purpose, so this is too.
 */
export type CardLogoutViewProps = {
  readonly title: string;
  readonly idLabel: string;
  readonly userId: string;
  readonly verificationLabel: string;
  readonly verificationValue: string;
  readonly logoutLabel: string;
  /** True while the logout runs. The action is not pressable then. */
  readonly isLoading: boolean;
  readonly onLogoutPress: () => void;
  /**
   * Makes the card holder's details actionable. A host passes it to reach its own tooling; without
   * one the details are plain text.
   */
  readonly onInspectSession?: () => void;
};

/** `null` means the component has nothing to show: nobody is signed in, or the user is still loading. */
export type CardLogoutViewModel = CardLogoutViewProps | null;
