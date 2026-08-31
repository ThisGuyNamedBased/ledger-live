import * as braze from "@braze/web-sdk";
import { type UserId, isDummyUserId } from "@domain/entity-client-identity";
import {
  runBrazeOptInTransition,
  runBrazeOptOutTransition,
  type BrazeIdentityLifecycleSdk,
} from "@ledgerhq/live-common/braze/identityLifecycle";

const brazeSdk = braze as typeof braze & Pick<BrazeIdentityLifecycleSdk, "wipeData" | "enableSDK">;

const webBrazeSdk: BrazeIdentityLifecycleSdk = {
  wipeData: () => brazeSdk.wipeData(),
  enableSDK: () => brazeSdk.enableSDK(),
  changeUser: userId => braze.changeUser(userId),
  refreshContentCards: () => braze.requestContentCardsRefresh(),
};

export const applyBrazeConsentTransition = async (
  {
    isTrackedUser,
    userId,
  }: {
    isTrackedUser: boolean;
    userId: UserId;
  },
  {
    prepareForIdentityTransition,
    refreshContentCards = webBrazeSdk.refreshContentCards,
    enableSDK = webBrazeSdk.enableSDK,
  }: {
    prepareForIdentityTransition?: () => void;
    refreshContentCards?: BrazeIdentityLifecycleSdk["refreshContentCards"];
    enableSDK?: BrazeIdentityLifecycleSdk["enableSDK"];
  } = {},
): Promise<void> => {
  if (isDummyUserId(userId)) return;

  prepareForIdentityTransition?.();
  const sdk = { ...webBrazeSdk, refreshContentCards, enableSDK };

  if (!isTrackedUser) {
    await runBrazeOptOutTransition(sdk);
    return;
  }

  await runBrazeOptInTransition(sdk, {
    userId: userId.exportUserIdForBraze(),
  });
};
