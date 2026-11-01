import { useCallback, useEffect, useRef, useState } from "react";
import { profileApi } from "../../../api/profileApi";
import type { Profile, ProfileErrors } from "../types";
import { validateProfile } from "../validation";
import { useAccountRequest } from "./useAccountRequest";
import { useAccountResource } from "./useAccountResource";
export function useProfileViewModel(accessToken?: string, sessionId?: string) {
  // La identidad permanece estable cuando se renueva la credencial de la misma sesión.
  const scope = sessionId ?? accessToken ?? "";
  const currentToken = useRef(accessToken);
  useEffect(() => { currentToken.current = accessToken; }, [accessToken]);
  const loader = useCallback((signal: AbortSignal) => profileApi.get(currentToken.current!, signal), []);
  const resource = useAccountResource(scope, loader, !!accessToken);
  const [draft, setDraft] = useState<{ scope: string; source: Profile; form: Profile } | null>(null);
  const [validation, setValidation] = useState<{ scope: string; values: ProfileErrors } | null>(null);
  const [savedSource, setSavedSource] = useState<{ scope: string; source: Profile } | null>(null);
  const request = useAccountRequest(scope);
  const form = draft?.scope === scope && draft.source === resource.data ? draft.form : resource.data;
  const errors = validation?.scope === scope ? validation.values : {};
  function change(key: keyof Profile, value: string) {
    if (!resource.data || !form) return;
    setDraft({ scope, source: resource.data, form: { ...form, [key]: value } });
    setValidation(previous => ({ scope, values: { ...(previous?.scope === scope ? previous.values : {}), [key]: undefined } }));
    setSavedSource(null); request.clearError();
  }
  function submit() {
    const token = currentToken.current;
    if (!form || !token || !resource.data) return;
    const source = resource.data, nextErrors = validateProfile(form);
    setValidation({ scope, values: nextErrors });
    if (Object.keys(nextErrors).length) return;
    void request.run(signal => profileApi.update(token, form, signal), value => {
      setDraft({ scope, source, form: value }); setSavedSource({ scope, source });
    });
  }
  return { form, errors, loadError: resource.error,
    saved: !!resource.data && savedSource?.scope === scope && savedSource.source === resource.data,
    change, submit, retry: resource.retry, ...request };
}
