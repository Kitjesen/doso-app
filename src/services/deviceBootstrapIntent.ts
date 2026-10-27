// Local navigation ownership only. This never creates or verifies a device.
export function createDeviceBootstrapIntent() {
  let userId: string | null = null;
  let locallyEntered = false;
  let ready = false;
  return {
    update(next: { userId: string | null; ready: boolean; reset: boolean }) {
      if (userId !== next.userId || next.reset) locallyEntered = false;
      userId = next.userId;
      ready = Boolean(userId && next.ready);
    },
    enter() {
      if (!ready) return false;
      locallyEntered = true;
      return true;
    },
    preservesNavigation(expectedUserId: string) {
      return ready && locallyEntered && userId === expectedUserId;
    },
    clearLocalEntry() {
      locallyEntered = false;
    },
    canCommit(expectedUserId: string) {
      return ready && userId === expectedUserId;
    },
  };
}
