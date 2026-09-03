/**
 * Registers Live App manifests that mock mode otherwise lacks.
 *
 * The built-in mock catalog ships 23 manifests, but neither the Swap app id nor
 * "earn" is among them, so those tabs fail with "App not found". Registering
 * them as *local* manifests is deterministic: it does not depend on a large
 * JSON blob surviving react-native-config, and local manifests take precedence
 * over remote ones in useLiveAppManifest.
 *
 * A Live App is a remote web page in a webview, so this makes the tab resolve an
 * app and load the real hosted UI against the mock accounts. It cannot fabricate
 * the Swap or Earn interface itself.
 */
import { useEffect } from "react";
import { useLocalLiveAppContext } from "@ledgerhq/live-common/wallet-api/LocalLiveAppProvider/index";
import type { LiveAppManifest } from "@ledgerhq/live-common/platform/types";
import { getEnv } from "@shared/env";

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
    domains: ["https://*"],
    visibility: "complete",
  }) as unknown as LiveAppManifest;

/** Ids the Swap and Earn entry points look up. */
const MOCK_MANIFESTS = [
  manifest("swap-live-app-demo-3", "Swap", "https://swap-live-app.ledger.com/", "swap"),
  manifest("earn", "Earn", "https://earn.live.ledger.com/", "earn"),
];

export default function MockLiveApps() {
  const { addLocalManifest } = useLocalLiveAppContext();

  useEffect(() => {
    if (!getEnv("MOCK")) return;
    MOCK_MANIFESTS.forEach(m => addLocalManifest(m));
  }, [addLocalManifest]);

  return null;
}
