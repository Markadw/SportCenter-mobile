import { useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "../context/SessionContext";
import { loginErrorMessage } from "../errors";
import type { LoginCredentials, LoginFieldErrors } from "../types";
import { validateLogin } from "../validation";

const EMPTY: LoginCredentials = { email: "", passw: "" };

export function useLoginViewModel() {
  const { session, notice, signIn } = useSession();
  const [values, setValues] = useState<LoginCredentials>(EMPTY);
  const [errors, setErrors] = useState<LoginFieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [passwordVisible, setPasswordVisible] = useState(false);
  const request = useRef<AbortController | null>(null);
  const mounted = useRef(true);

  const reset = useCallback(() => {
    request.current?.abort();
    request.current = null;
    setValues(EMPTY);
    setErrors({});
    setError(null);
    setPending(false);
    setPasswordVisible(false);
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      request.current?.abort();
    };
  }, []);

  useFocusEffect(useCallback(() => reset, [reset]));

  function change(field: keyof LoginCredentials, value: string) {
    if (request.current) return;
    setValues((previous) => ({ ...previous, [field]: value }));
    setErrors((previous) => ({ ...previous, [field]: undefined }));
    setError(null);
  }

  async function submit() {
    if (request.current || !mounted.current || session) return;
    const validation = validateLogin(values);
    setErrors(validation);
    setError(null);
    if (Object.keys(validation).length) return;
    const controller = new AbortController();
    request.current = controller;
    setPending(true);
    try {
      await signIn(values, controller.signal);
      if (mounted.current && !controller.signal.aborted) {
        setValues(EMPTY);
        setPasswordVisible(false);
      }
    } catch (cause) {
      if (mounted.current && !controller.signal.aborted) setError(loginErrorMessage(cause));
    } finally {
      if (request.current === controller) request.current = null;
      if (mounted.current && !controller.signal.aborted) setPending(false);
    }
  }

  return {
    values, errors, error, pending, notice, session, passwordVisible, change, submit,
    togglePassword: () => setPasswordVisible((visible) => !visible),
  };
}
