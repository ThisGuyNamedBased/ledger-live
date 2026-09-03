/**
 * Makes the app's own pairing flow usable in a mock build.
 *
 * Mock BLE scanning starts empty and is normally filled by the e2e test runner
 * over the websocket bridge. With no runner attached, the scanning screen finds
 * nothing and "add a device" cannot be completed. Seeding the scan results lets
 * the real flow run end to end: the devices appear in scanning, pairing goes
 * through the app's normal path, and unpairing works from device settings.
 *
 * This only publishes discoverable devices. Nothing is marked as paired, so the
 * app still starts in the unpaired state.
 */
import { useEffect } from "react";
import { DeviceModelId } from "@ledgerhq/types-devices";
import { getEnv } from "@shared/env";
import { seedMockBleScannedDevices } from "~/transport/bleTransport/useMockBle";

const DISCOVERABLE = [
  { deviceId: "mock|stax", deviceName: "Ledger Stax", modelId: DeviceModelId.stax, wired: false },
  { deviceId: "mock|nanoX", deviceName: "Ledger Nano X", modelId: DeviceModelId.nanoX, wired: false },
  { deviceId: "mock|europa", deviceName: "Ledger Flex", modelId: DeviceModelId.europa, wired: false },
];

export default function MockDevices() {
  useEffect(() => {
    if (!getEnv("MOCK")) return;
    seedMockBleScannedDevices(DISCOVERABLE);
  }, []);

  return null;
}
