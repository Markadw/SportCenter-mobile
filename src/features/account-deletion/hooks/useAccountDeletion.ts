import { useEffect, useState, useSyncExternalStore } from "react";
import { useSession } from "../../auth/context/SessionContext";
import { AccountDeletionController } from "../AccountDeletionController";
import { canRequestAccountDeletion } from "../eligibility";

export function useAccountDeletion() {
  const auth = useSession();
  const [controller] = useState(() => new AccountDeletionController(auth));
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  useEffect(() => { controller.activate(); return () => controller.dispose(); }, [controller]);
  useEffect(() => { controller.sessionChanged(); }, [controller, auth.session]);
  return {
    state: { ...state, restoring: state.restoring || auth.isRestoring },
    signedIn: !!auth.session,
    canStart: !auth.isRestoring && canRequestAccountDeletion(auth.session?.accessToken),
    start: controller.start, verify: controller.verify, confirm: controller.confirm,
    refreshResult: controller.refreshResult, cancel: controller.cancel,
    restartUnconfirmed: controller.restartUnconfirmed, discardUnavailableReceipt: controller.discardUnavailableReceipt,
  };
}
