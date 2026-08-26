import React from "react";
import { CardLogoutView } from "./CardLogoutView";
import { useCardLogoutViewModel } from "./useCardLogoutViewModel";

/** What a host may hand the logout. Everything else it works out for itself. */
export type CardLogoutProps = {
  /** Makes the card holder's details actionable, so a host can reach its own tooling. */
  readonly onInspectSession?: () => void;
};

/**
 * The logout, on its own. It decides for itself whether it belongs on screen: it appears once a Card
 * session is live, and it renders nothing otherwise, so a caller can drop it beside `CardLogin` and
 * pass it nothing.
 *
 * Rendering nothing is not the same as leaving: the caller keeps this component mounted, so the
 * ViewModel holds its state across a whole login, logout and login again.
 */
export function CardLogout({ onInspectSession }: CardLogoutProps = {}) {
  const logout = useCardLogoutViewModel();

  return logout ? <CardLogoutView {...logout} onInspectSession={onInspectSession} /> : null;
}
