/**
 * The Card session controls are mobile-only for now.
 *
 * The web panel does not render them, and `usePayCardToolProps` only builds `auth` for the native
 * host, so this variant exists to keep the platform pair complete.
 */
export function AuthSection() {
  return null;
}
