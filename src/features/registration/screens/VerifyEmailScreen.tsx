import { useLocalSearchParams, useRouter } from "expo-router";
import { Field, Form, FormButton, FormMessage } from "../components/Form";
import { useVerificationViewModel } from "../hooks/useVerificationViewModel";

export function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const router = useRouter();
  const vm = useVerificationViewModel(typeof params.email === "string" ? params.email : "");
  if (vm.verified) {
    return (
      <Form title="Cuenta verificada" description="Tu correo quedó confirmado. Gracias por registrarte en Sport Center.">
        <FormButton label="Volver a la tienda" onPress={() => router.replace("/")} />
      </Form>
    );
  }
  return (
    <Form title="Verificar correo" description="Introduce el correo de tu registro y el código de 6 dígitos que recibiste. El código vence en 24 horas y permite 3 intentos.">
      <Field label="Correo electrónico" keyboardType="email-address" autoComplete="email"
        value={vm.form.email} onChangeText={(value) => vm.setField("email", value)}
        error={vm.errors.email} editable={!vm.pending} />
      <Field label="Código de verificación" keyboardType="number-pad" autoComplete="one-time-code" maxLength={6}
        value={vm.form.token} onChangeText={(value) => vm.setField("token", value)}
        error={vm.errors.token} editable={!vm.pending}
        returnKeyType="done" onSubmitEditing={() => void vm.verify()} />
      <FormMessage text={vm.error} error />
      <FormMessage text={vm.notice} />
      <FormButton label="Verificar cuenta" onPress={() => void vm.verify()} disabled={!!vm.pending} busy={vm.pending === "verify"} />
      <FormButton label="Reenviar código" onPress={() => void vm.resend()} disabled={!!vm.pending} busy={vm.pending === "resend"} secondary />
    </Form>
  );
}
