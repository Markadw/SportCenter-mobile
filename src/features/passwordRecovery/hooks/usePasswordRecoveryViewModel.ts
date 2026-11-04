import { useEffect, useState } from "react";
import { passwordRecoveryApi } from "../../../api/passwordRecoveryApi";
import { useAccountRequest } from "../../profile/hooks/useAccountRequest";
import { validateRecovery, type RecoveryForm, type RecoveryErrors } from "../validation";
import { normalizeEmail } from "../../registration/validation";
export function usePasswordRecoveryViewModel() {
  const [form, setForm] = useState<RecoveryForm>({ email: "", token: "", psw: "", confirmation: "" });
  const [stage, setStage] = useState<"email" | "reset" | "done">("email"), [errors, setErrors] = useState<RecoveryErrors>({});
  const [deadline, setDeadline] = useState(0), [now, setNow] = useState(() => Date.now()), request = useAccountRequest();
  useEffect(() => { if (!deadline) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [deadline]);
  const cooldown = Math.max(0, Math.ceil((deadline - now) / 1000));
  function change(key: keyof RecoveryForm, value: string) {
    setForm(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: undefined })); request.clearError();
  }
  function sendCode() {
    if (cooldown || request.pending) return;
    const next = validateRecovery(form, false); setErrors(next);
    if (Object.keys(next).length) return;
    void request.run(signal => passwordRecoveryApi.requestCode(form.email, signal), () => {
      setForm(previous => ({ ...previous, token: "", psw: "", confirmation: "" })); setStage("reset"); setDeadline(Date.now() + 60000); setNow(Date.now());
    });
  }
  function submit() {
    const next = validateRecovery(form, true); setErrors(next);
    if (Object.keys(next).length) return;
    void request.run(signal => passwordRecoveryApi.reset(form, signal), () => {
      setForm({ email: "", token: "", psw: "", confirmation: "" }); setStage("done");
    });
  }
  function resumeWithCode() {
    if (request.pending || stage !== "email") return;
    const next = validateRecovery(form, false); setErrors(next);
    if (Object.keys(next).length) return;
    request.cancel(); request.clearError();
    setForm({ email: normalizeEmail(form.email), token: "", psw: "", confirmation: "" });
    setStage("reset");
  }
  function changeEmail() { request.cancel(); request.clearError(); setStage("email"); setForm(previous => ({ ...previous, token: "", psw: "", confirmation: "" })); setErrors({}); }
  return { form, stage, errors, cooldown, change, sendCode, submit, resumeWithCode, changeEmail, ...request };
}
