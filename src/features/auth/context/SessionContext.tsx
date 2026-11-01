import {
  createContext, useContext, useEffect, useMemo, useState, useSyncExternalStore,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import axiosClient from "../../../api/axios";
import type { LoginCredentials, Session } from "../types";
import { SessionController } from "./SessionController";
import { registerSessionInterceptors } from "./sessionInterceptors";

interface SessionState {
  session: Session | null;
  sessionScopeId: string | null;
  notice: string | null;
  isRestoring: boolean;
  signIn: (credentials: LoginCredentials, signal: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [controller] = useState(() => new SessionController());
  const snapshot = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);

  useEffect(() => {
    const unregister = registerSessionInterceptors(axiosClient, controller);
    controller.activate();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") void controller.refreshIfNeeded().catch(() => {});
    });
    return () => {
      unregister();
      subscription.remove();
      controller.dispose();
    };
  }, [controller]);

  useEffect(() => {
    const delay = controller.refreshDelay();
    if (delay === null) return;
    const timer = setTimeout(() => { void controller.refreshIfNeeded().catch(() => {}); }, delay);
    return () => clearTimeout(timer);
  }, [controller, snapshot]);

  const value = useMemo(() => ({
    ...snapshot, signIn: controller.signIn, signOut: controller.signOut,
  }), [controller, snapshot]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession requiere SessionProvider");
  return context;
}
