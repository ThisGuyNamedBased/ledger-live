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
import { getEnv } from "@shared/env";
import { seedMockBleScannedDevices } from "~/transport/bleTransport/useMockBle";
import { setMockDeviceName } from "~/transport/bleTransport";
import { listMockDevices } from "~/transport/mockDeviceCatalog";

export default function MockDevices() {
  useEffect(() => {
    if (!getEnv("MOCK")) return;
    const devices = listMockDevices();

    // Seed the transport's name map too, otherwise the APDU get-name command
    // reports the raw device id until something renames it.
    devices.forEach(d => setMockDeviceName(d.id, d.name));

    seedMockBleScannedDevices(
      devices.map(d => ({
        deviceId: d.id,
        deviceName: d.name,
        modelId: d.modelId,
        wired: false,
      })),
    );
  }, []);

  return null;
}
