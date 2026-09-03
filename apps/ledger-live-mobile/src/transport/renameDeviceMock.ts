/**
 * Mock implementation of the device rename flow.
 *
 * The shared mock event subject cannot serve this action: completion requires a
 * "device-renamed" event carrying the *requested* name, which only the caller
 * knows. Driving it from a generic auto-answer would rename the device to
 * whatever fixed string that answer chose. This emits the real sequence with
 * the real name, so renaming behaves as it does with a device attached.
 */
import { Observable } from "rxjs";
import type { Input, RenameDeviceEvent } from "@ledgerhq/live-common/hw/renameDevice";

const PERMISSION_DELAY = 300;
const RENAME_DELAY = 1200;

export default function renameDeviceMock({ request }: Input): Observable<RenameDeviceEvent> {
  return new Observable<RenameDeviceEvent>(o => {
    // Mirrors the real flow: the device asks the user to allow the rename,
    // then reports the applied name.
    const askTimer = setTimeout(() => o.next({ type: "permission-requested" }), PERMISSION_DELAY);
    const doneTimer = setTimeout(() => {
      o.next({ type: "device-renamed", name: request.name });
      o.complete();
    }, RENAME_DELAY);

    return () => {
      clearTimeout(askTimer);
      clearTimeout(doneTimer);
    };
  });
}
