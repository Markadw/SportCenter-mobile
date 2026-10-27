import { isAxiosError } from "axios";
import {
  createContext, useCallback, useContext, useEffect, useMemo, useRef, useState,
  type PropsWithChildren,
} from "react";
import { AppState } from "react-native";
import { authApi } from "../../../api/authApi";
import axiosClient from "../../../api/axios";
import type { LoginCredentials, Session } from "../types";

interface SessionState {
  session: Session | null;
  notice: string | null;
  signIn: (credentials: LoginCredentials, signal: AbortSignal) => Promise<void>;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionState | null>(null);

export function SessionProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const current = useRef<Session | null>(null);
  const generation = useRef(0);
  const mounted = useRef(true);

  const endSession = useCallback((message: string | null) => {
    generation.current += 1;
    current.current = null;
    setSession(null);
    setNotice(message);
  }, []);

  const signIn = useCallback(async (credentials: LoginCredentials, signal: AbortSignal) => {
    const attempt = ++generation.current;
    const next = await authApi.login(credentials, signal);
    if (!mounted.current || signal.aborted || generation.current !== attempt) return;
    current.current = next;
    setSession(next);
    setNotice(null);
  }, []);

  const signOut = useCallback(async () => {
    const previous = current.current;
    endSession(null);
    const attempt = generation.current;
    if (!previous) return;
    try {
      await authApi.logout(previous.accessToken);
    } catch (error) {
      const alreadyEnded = isAxiosError(error) && error.response?.status === 401;
      if (!alreadyEnded && mounted.current && generation.current === attempt) {
        setNotice("Cerramos la sesión en este dispositivo, pero no pudimos confirmar el cierre en el servidor.");
      }
    }
  }, [endSession]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      generation.current += 1;
      current.current = null;
    };
  }, []);

  useEffect(() => {
    if (!session) return;
    const expire = () => {
      if (current.current === session && Date.now() >= session.expiresAt) {
        endSession("Tu sesión venció. Vuelve a iniciar sesión.");
      }
    };
    const timer = setTimeout(expire, Math.max(0, session.expiresAt - Date.now()));
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") expire();
    });
    return () => {
      clearTimeout(timer);
      subscription.remove();
    };
  }, [session, endSession]);

  useEffect(() => {
    const interceptor = axiosClient.interceptors.response.use(undefined, (error: unknown) => {
      if (isAxiosError(error) && error.response?.status === 401 && current.current) {
        // Solo invalida la sesión cuyo token se envió; una respuesta antigua no cierra otra cuenta.
        const authorization = error.config?.headers?.get("Authorization");
        if (authorization === `Bearer ${current.current.accessToken}`) {
          endSession("Tu sesión ya no está activa. Vuelve a iniciar sesión.");
        }
      }
      return Promise.reject(error);
    });
    return () => axiosClient.interceptors.response.eject(interceptor);
  }, [endSession]);

  const value = useMemo(() => ({ session, notice, signIn, signOut }), [session, notice, signIn, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  const context = useContext(SessionContext);
  if (!context) throw new Error("useSession requiere SessionProvider");
  return context;
}
