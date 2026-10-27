import { useRouter } from "expo-router";
import { Field, Form, FormButton, FormMessage } from "../components/Form";
import { useRegisterViewModel } from "../hooks/useRegisterViewModel";
import { PASSWORD_HELP } from "../validation";

export function RegisterScreen() {
  const vm = useRegisterViewModel();
  const router = useRouter();
  return (
    <Form title="Crear cuenta" description="Todos los campos son obligatorios. Al registrarte recibirás un código por correo para verificar tu cuenta.">
      <Field label="Nombre" autoCapitalize="words" autoComplete="given-name"
        value={vm.form.nombre} onChangeText={(value) => vm.setField("nombre", value)}
        error={vm.errors.nombre} editable={!vm.pending} />
      <Field label="Apellido paterno" autoCapitalize="words" autoComplete="family-name"
        value={vm.form.aPaterno} onChangeText={(value) => vm.setField("aPaterno", value)}
        error={vm.errors.aPaterno} editable={!vm.pending} />
      <Field label="Apellido materno" autoCapitalize="words"
        value={vm.form.aMaterno} onChangeText={(value) => vm.setField("aMaterno", value)}
        error={vm.errors.aMaterno} editable={!vm.pending} />
      <Field label="Correo electrónico" keyboardType="email-address" autoComplete="email"
        value={vm.form.email} onChangeText={(value) => vm.setField("email", value)}
        error={vm.errors.email} editable={!vm.pending} />
      <Field label="Teléfono" keyboardType="phone-pad" autoComplete="tel-national"
        hint="10 dígitos, sin espacios ni prefijo de país."
        value={vm.form.telefono} onChangeText={(value) => vm.setField("telefono", value)}
        error={vm.errors.telefono} editable={!vm.pending} />
      <Field label="Contraseña" secureTextEntry autoComplete="new-password" hint={PASSWORD_HELP}
        value={vm.form.passw} onChangeText={(value) => vm.setField("passw", value)}
        error={vm.errors.passw} editable={!vm.pending} />
      <Field label="Confirmar contraseña" secureTextEntry autoComplete="new-password"
        value={vm.form.confirmPassword} onChangeText={(value) => vm.setField("confirmPassword", value)}
        error={vm.errors.confirmPassword} editable={!vm.pending}
        returnKeyType="done" onSubmitEditing={() => void vm.submit()} />
      <FormMessage text={vm.error} error />
      <FormButton label="Crear cuenta" onPress={() => void vm.submit()} busy={vm.pending} />
      <FormButton label="Ya tengo una cuenta" onPress={() => router.replace("/login")} disabled={vm.pending} secondary />
      <FormButton label="Ya tengo un código" onPress={vm.resumeVerification} disabled={vm.pending} secondary />
    </Form>
  );
}
