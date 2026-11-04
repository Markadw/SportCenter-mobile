import { Link } from "expo-router";
import { Form, Field, FormButton, FormMessage } from "../../registration/components/Form";
import { PASSWORD_HELP } from "../../registration/validation";
import { usePasswordRecoveryViewModel } from "../hooks/usePasswordRecoveryViewModel";
export function PasswordRecoveryScreen() {
  const model = usePasswordRecoveryViewModel();
  if (model.stage === "done") return <Form title="Contraseña actualizada" description="Tu contraseña se cambió correctamente. Inicia sesión con la nueva contraseña."><Link href="/login" accessibilityRole="link">Ir a iniciar sesión</Link></Form>;
  return <Form title="Recuperar contraseña" description={model.stage === "email" ? "Te enviaremos un código de recuperación a tu correo." : "Escribe el código del correo y tu nueva contraseña. El código solo se usa al guardar."}>
    <Field label="Correo" value={model.form.email} onChangeText={value => model.change("email", value)} error={model.errors.email} keyboardType="email-address" autoComplete="email" maxLength={100} editable={!model.pending && model.stage === "email"} />
    {model.stage === "reset" && <>
      <Field label="Código de recuperación" value={model.form.token} onChangeText={value => model.change("token", value)} error={model.errors.token} keyboardType="number-pad" maxLength={6} autoComplete="one-time-code" editable={!model.pending} />
      <Field label="Nueva contraseña" value={model.form.psw} onChangeText={value => model.change("psw", value)} error={model.errors.psw} hint={PASSWORD_HELP} secureTextEntry autoComplete="new-password" editable={!model.pending} />
      <Field label="Confirmar contraseña" value={model.form.confirmation} onChangeText={value => model.change("confirmation", value)} error={model.errors.confirmation} secureTextEntry autoComplete="new-password" editable={!model.pending} />
    </>}
    <FormMessage text={model.error ? (model.stage === "reset" ? "No pudimos cambiar la contraseña. Revisa el código y la nueva contraseña; solicita otro código si venció o agotaste los intentos." : "No pudimos enviar el código. Revisa tu correo, la activación de tu cuenta y tu conexión. Si realizaste varios intentos, espera un minuto.") : null} error />
    {model.stage === "email" ? <>
      <FormButton label="Enviar código" onPress={model.sendCode} busy={model.pending} disabled={model.cooldown > 0} />
      <FormButton label="Ya tengo un código de recuperación" onPress={model.resumeWithCode} disabled={model.pending} secondary />
    </> : <>
      <FormButton label="Actualizar contraseña" onPress={model.submit} busy={model.pending} />
      <FormButton label={model.cooldown ? "Reenviar código en " + model.cooldown + " s" : "Reenviar código"} onPress={model.sendCode} disabled={model.pending || model.cooldown > 0} secondary />
      <FormButton label="Cambiar correo" onPress={model.changeEmail} secondary />
    </>}
    {model.pending && <FormButton label="Cancelar solicitud" onPress={model.cancel} secondary />}
    {model.stage === "email" && model.cooldown > 0 && <FormMessage text={"Podrás solicitar otro código en " + model.cooldown + " s."} />}
    <Link href="/login" accessibilityRole="link">Volver a iniciar sesión</Link>
  </Form>;
}
