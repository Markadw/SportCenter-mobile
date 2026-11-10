import { useEffect, useState } from "react";
import { passwordRecoveryApi } from "../../../api/passwordRecoveryApi";
import { useAccountRequest } from "../../profile/hooks/useAccountRequest";
import { resetIssue, type ResetIssue } from "../errors";
import { validateRecovery, type RecoveryForm, type RecoveryErrors } from "../validation";
import { normalizeEmail } from "../../registration/validation";
export function usePasswordRecoveryViewModel() {
  const [form, setForm] = useState<RecoveryForm>({ email: "", token: "", psw: "", confirmation: "" });
  const [stage, setStage] = useState<"email" | "reset" | "done">("email"), [errors, setErrors] = useState<RecoveryErrors>({});
  const [deadline, setDeadline] = useState(0), [now, setNow] = useState(() => Date.now()), request = useAccountRequest();
  // Pasos visuales dentro de «reset»: el código sólo se valida en formato; el servidor lo comprueba al actualizar.
  const [step, setStep] = useState<"code" | "password">("code"), [issue, setIssue] = useState<ResetIssue | null>(null);
  useEffect(() => { if (!deadline) return; const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, [deadline]);
  const cooldown = Math.max(0, Math.ceil((deadline - now) / 1000));
  function change(key: keyof RecoveryForm, value: string) {
    setForm(previous => ({ ...previous, [key]: value })); setErrors(previous => ({ ...previous, [key]: undefined })); request.clearError(); setIssue(null);
  }
  function sendCode() {
    if (cooldown || request.pending) return;
    const next = validateRecovery(form, false); setErrors(next);
    if (Object.keys(next).length) return;
    void request.run(signal => passwordRecoveryApi.requestCode(form.email, signal), () => {
      setForm(previous => ({ ...previous, token: "", psw: "", confirmation: "" })); setStage("reset"); setStep("code"); setIssue(null); setDeadline(Date.now() + 60000); setNow(Date.now());
    });
  }
  function continueToPassword() {
    if (request.pending) return;
    const token = validateRecovery(form, true).token;
    setErrors(token ? { token } : {});
    if (!token) { request.clearError(); setIssue(null); setStep("password"); }
  }
  function backToCode() { if (!request.pending) { setStep("code"); setErrors({}); } }
  function submit() {
    const next = validateRecovery(form, true); setErrors(next);
    if (next.token) { setStep("code"); return; }
    if (Object.keys(next).length) return;
    setIssue(null);
    void request.run(signal => passwordRecoveryApi.reset(form, signal).catch((cause: unknown) => {
      const known = resetIssue(cause);
      if (!signal.aborted) { setIssue(known); if (known?.step === "code") setStep("code"); }
      throw cause;
    }), () => {
      setForm({ email: "", token: "", psw: "", confirmation: "" }); setStage("done");
    });
  }
  function resumeWithCode() {
    if (request.pending || stage !== "email") return;
    const next = validateRecovery(form, false); setErrors(next);
    if (Object.keys(next).length) return;
    request.cancel(); request.clearError();
    setForm({ email: normalizeEmail(form.email), token: "", psw: "", confirmation: "" });
    setStage("reset"); setStep("code"); setIssue(null);
  }
  function changeEmail() { request.cancel(); request.clearError(); setIssue(null); setStep("code"); setStage("email"); setForm(previous => ({ ...previous, token: "", psw: "", confirmation: "" })); setErrors({}); }
  return { form, stage, step, issue, errors, cooldown, change, sendCode, submit, continueToPassword, backToCode, resumeWithCode, changeEmail, ...request };
}
