/**
 * Registers Live App manifests that mock mode otherwise lacks.
 *
 * The built-in mock catalog ships 23 manifests, but neither the Swap app id nor
 * "earn" is among them, so those tabs fail with "App not found". Registering
 * them as *local* manifests is deterministic: it does not depend on a large
 * JSON blob surviving react-native-config, and local manifests take precedence
 * over remote ones in useLiveAppManifest.
 *
 * The manifests point at a stub app embedded as a data: URL rather than at the
 * real remote apps, so the tabs work offline and never reach a provider. See
 * mockLiveAppHtml for what the stub does and deliberately does not do.
 */
import { useEffect } from "react";
import { useLocalLiveAppContext } from "@ledgerhq/live-common/wallet-api/LocalLiveAppProvider/index";
import type { LiveAppManifest } from "@ledgerhq/live-common/platform/types";
import { getEnv } from "@shared/env";
import { MOCK_EARN_URL, MOCK_SWAP_URL } from "./mockLiveAppHtml";

const PERMISSIONS = [
  "account.list",
  "account.receive",
  "account.request",
  "currency.list",
  "device.close",
  "device.exchange",
  "device.transport",
  "message.sign",
  "transaction.sign",
  "transaction.signAndBroadcast",
  "storage.set",
  "storage.get",
  "wallet.capabilities",
  "wallet.userId",
  "wallet.info",
];

const manifest = (
  id: string,
  name: string,
  url: string,
  category: string,
): LiveAppManifest =>
  ({
    id,
    name,
    url,
    homepageUrl: "https://www.ledger.com/",
    icon: "",
    platforms: ["ios", "android", "desktop"],
    apiVersion: "^2.0.0",
    manifestVersion: "1",
    branch: "stable",
    categories: [category],
    currencies: "*",
    content: {
      shortDescription: { en: `${name} (mock manifest)` },
      description: { en: `${name} (mock manifest)` },
    },
    permissions: PERMISSIONS,
    // Includes data: so the stub app served from the manifest itself is allowed.
    domains: ["*"],
    visibility: "complete",
  }) as unknown as LiveAppManifest;

/** Ids the Swap and Earn entry points look up. */
const MOCK_MANIFESTS = [
  // Served from the manifest itself: a remote URL either fails with no network
  // or reaches the real provider with it, neither of which is a mock.
  manifest("swap-live-app-demo-3", "Swap", MOCK_SWAP_URL, "swap"),
  manifest("earn", "Earn", MOCK_EARN_URL, "earn"),
];

export default function MockLiveApps() {
  const { addLocalManifest } = useLocalLiveAppContext();

  useEffect(() => {
    if (!getEnv("MOCK")) return;
    MOCK_MANIFESTS.forEach(m => addLocalManifest(m));
  }, [addLocalManifest]);

  return null;
}
