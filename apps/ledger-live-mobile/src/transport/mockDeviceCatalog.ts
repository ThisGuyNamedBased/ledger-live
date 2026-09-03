/**
 * The devices a mock build pretends are nearby.
 *
 * Single source of truth so BLE scanning, the transport's listen() and the dev
 * panel all present the same set. Real per-model service UUIDs are used so the
 * app resolves each device to the right model rather than defaulting to Nano X.
 */
import { DeviceModelId, getDeviceModel } from "@ledgerhq/devices";

export type MockDeviceEntry = {
  id: string;
  name: string;
  modelId: DeviceModelId;
  serviceUuid: string;
};

const MODELS: { id: string; name: string; modelId: DeviceModelId }[] = [
  { id: "mock|stax", name: "Ledger Stax", modelId: DeviceModelId.stax },
  { id: "mock|nanoX", name: "Ledger Nano X", modelId: DeviceModelId.nanoX },
  { id: "mock|europa", name: "Ledger Flex", modelId: DeviceModelId.europa },
];

/**
 * Models without a bluetooth spec cannot be represented over the BLE mock and
 * are dropped rather than given a wrong UUID, which would mis-identify them.
 */
export const listMockDevices = (): MockDeviceEntry[] =>
  MODELS.flatMap(({ id, name, modelId }) => {
    const serviceUuid = getDeviceModel(modelId).bluetoothSpec?.[0]?.serviceUuid;
    return serviceUuid ? [{ id, name, modelId, serviceUuid }] : [];
  });
