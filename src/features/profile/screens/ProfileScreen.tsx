import { Redirect, useRouter } from "expo-router";
import { canRequestAccountDeletion } from "../../account-deletion/eligibility";
import { useSession } from "../../auth/context/SessionContext";
import { Form, Field, FormButton, FormMessage } from "../../registration/components/Form";
import { ScreenState } from "../../../components/ScreenState";
import { useProfileViewModel } from "../hooks/useProfileViewModel";
export function ProfileScreen() {
  const router = useRouter();
  const auth = useSession(), { session } = auth, model = useProfileViewModel(session?.accessToken, session?.sessionId);
  if ("isRestoring" in auth && auth.isRestoring === true) return <ScreenState title="Restaurando sesión" loading />;
  if (!session) return <Redirect href="/login" />;
  if (model.loadError) return <ScreenState title="No se pudo cargar tu perfil" message={model.loadError} action="Reintentar" onAction={model.retry} />;
  if (!model.form) return <ScreenState title="Cargando perfil" loading />;
  return <Form title="Mi perfil" description="Actualiza tus datos personales y de contacto.">
    <Field label="Nombre" value={model.form.nombre} onChangeText={value => model.change("nombre", value)} error={model.errors.nombre} maxLength={30} editable={!model.pending} autoCapitalize="words" />
    <Field label="Apellido paterno" value={model.form.aPaterno} onChangeText={value => model.change("aPaterno", value)} error={model.errors.aPaterno} maxLength={40} editable={!model.pending} autoCapitalize="words" />
    <Field label="Apellido materno" value={model.form.aMaterno} onChangeText={value => model.change("aMaterno", value)} error={model.errors.aMaterno} maxLength={40} editable={!model.pending} autoCapitalize="words" />
    <Field label="Correo" value={model.form.email} onChangeText={value => model.change("email", value)} error={model.errors.email} keyboardType="email-address" maxLength={100} editable={!model.pending} autoComplete="email" />
    <Field label="Teléfono" value={model.form.telefono} onChangeText={value => model.change("telefono", value)} error={model.errors.telefono} keyboardType="phone-pad" maxLength={10} editable={!model.pending} autoComplete="tel" />
    <FormMessage text={model.error} error />
    <FormMessage text={model.saved ? "Tu perfil se actualizó correctamente." : null} />
    <FormButton label="Guardar cambios" onPress={model.submit} busy={model.pending} />
    {canRequestAccountDeletion(session.accessToken) && <FormButton label="Eliminar cuenta" secondary disabled={model.pending} onPress={() => router.push("/account-deletion")} />}
  </Form>;
}
