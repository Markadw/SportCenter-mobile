import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { ScreenState } from "../../../components/ScreenState";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { SUPPORT_EMAIL } from "../../privacy/config";
import { Field, Form, FormButton, FormMessage } from "../../registration/components/Form";
import { useAccountDeletion } from "../hooks/useAccountDeletion";
import type { DeletionResult, DeletionVerification } from "../types";

const CATEGORY_LABELS: Record<string, string> = {
  orders: "Pedidos y comprobantes de compra", payments: "Registros de pagos",
  orders_and_payments: "Pedidos y registros de pagos", shipments: "Información de entregas",
  shipping: "Información de entregas", returns: "Devoluciones y atención relacionada",
  legal_records: "Registros sujetos a obligaciones legales", audit: "Constancias de atención y cumplimiento",
};
const RESULT_TITLES: Record<DeletionResult["status"], string> = {
  received: "Solicitud recibida", identity_verified: "Identidad verificada",
  deletion_confirmed: "Eliminación confirmada", in_progress: "Eliminación en proceso",
  completed: "Tu cuenta fue eliminada", requires_attention: "Tu solicitud necesita atención",
  error: "La eliminación no está completada",
};

function reasonText(reason: string): string {
  if (["open_orders", "open_orders_or_returns", "pending_orders", "pending_returns"].includes(reason)) return "Hay pedidos, entregas o devoluciones que requieren atención.";
  if (reason === "pending_payments") return "Hay pagos del pedido que requieren revisión antes de completar la eliminación.";
  if (reason === "retention_policy_required") return "El equipo debe precisar qué información debe conservarse y durante cuánto tiempo.";
  if (reason === "identity_changed") return "La información de identidad cambió. Es necesario verificar de nuevo la solicitud.";
  return "El equipo debe revisar una condición de tu solicitud. Contacta a soporte para conocer el seguimiento.";
}
function categories(values: string[]) {
  return [...new Set(values.map(value => CATEGORY_LABELS[value] ?? "Otros registros sujetos a conservación legal"))];
}
function resultDescription(result: DeletionResult | null, unknown: boolean): string {
  if (unknown || !result) return "El resultado todavía debe comprobarse. La solicitud puede haberse procesado. Consulta su estado antes de intentar otra acción.";
  if (result.status === "completed") return "La eliminación de tu cuenta se completó. Los registros sujetos a una obligación legal se conservan únicamente con ese fin. Un registro futuro creará una cuenta nueva, sin recuperar tus datos ni tu historial anterior.";
  if (result.status === "requires_attention") return "El equipo debe atender una situación especial antes de completar la eliminación. Tu solicitud sigue registrada; puedes consultar su estado o contactar a soporte.";
  if (result.status === "error") return "Todavía no podemos dar la cuenta por eliminada. Consulta el estado de la solicitud o contacta al equipo de atención.";
  if (["received", "identity_verified"].includes(result.status)) return "El estado registrado todavía no acredita una eliminación confirmada. Puedes consultar el resultado o solicitar ayuda al equipo de atención.";
  return "Tu solicitud está en proceso. Esta pantalla sólo mostrará la eliminación como completada cuando el servicio lo confirme.";
}

export function AccountDeletionScreen() {
  const model = useAccountDeletion(), { state } = model, router = useRouter();
  const [code, setCode] = useState(""), [codeError, setCodeError] = useState<string | null>(null);
  const [confirmationFor, setConfirmationFor] = useState<DeletionVerification | null>(null);
  const { verification, result } = state;
  const confirmed = verification !== null && confirmationFor === verification;
  const completed = result?.status === "completed" && !state.outcomeUnknown;
  const unconfirmed = !state.outcomeUnknown && result && ["received", "identity_verified"].includes(result.status);
  const resetInputs = () => { setCode(""); setCodeError(null); setConfirmationFor(null); };
  function verify() {
    if (state.busy) return;
    if (!/^[0-9]{6}$/.test(code)) { setCodeError("Ingresa un código de seis dígitos."); return; }
    const value = code;
    resetInputs();
    void model.verify(value);
  }
  if (state.restoring) return <ScreenState title="Recuperando seguimiento" loading />;
  return <Form title="Eliminar mi cuenta" description="Verifica tu identidad y revisa las consecuencias antes de confirmar.">
    <Text style={styles.step}>Paso {({ start: "1 de 4 · Solicitud", code: "2 de 4 · Verificación", review: "3 de 4 · Confirmación", result: "4 de 4 · Resultado" })[state.stage]}</Text>
    <FormMessage text={state.error} error />
    <FormMessage text={state.cleanupWarning} error />
    {state.cleanupWarning && <FormButton label="Reintentar limpieza" secondary disabled={state.busy} onPress={() => { void model.refreshResult(); }} />}
    {state.stage === "start" && <>
      {model.canStart ? <>
        <Text accessibilityRole="header" style={styles.heading}>Primero, confirma que eres tú</Text>
        <Text style={styles.text}>Enviaremos un código al correo verificado que protege la eliminación de tu cuenta. Si cambiaste el correo de tu perfil, puede ser el correo anterior.</Text>
        <Text style={styles.text}>Enviar o verificar el código todavía no elimina tu cuenta. Podrás revisar las consecuencias y volver sin eliminarla.</Text>
        <FormButton label="Enviar código de verificación" busy={state.busy} onPress={() => { resetInputs(); void model.start(); }} />
      </> : <>
        <Text accessibilityRole="header" style={styles.heading}>{model.signedIn ? "Atención para cuentas del equipo" : "Inicia sesión para comenzar"}</Text>
        <Text style={styles.text}>{model.signedIn ? "Las cuentas con permisos de trabajo o administración requieren atención específica para proteger las operaciones del negocio." : "Inicia sesión con la cuenta que deseas eliminar. Después podrás recibir el código de verificación."}</Text>
        {!model.signedIn && <FormButton label="Iniciar sesión" onPress={() => router.push("/login")} />}
      </>}
    </>}
    {state.stage === "code" && <>
      <Text accessibilityRole="header" style={styles.heading}>Revisa tu correo</Text>
      <Text style={styles.text}>Escribe el código exclusivo de seis dígitos que te enviamos. Usa el más reciente y no lo compartas.</Text>
      {state.expiresAt && <Text style={styles.muted}>El código vence el {new Date(state.expiresAt).toLocaleString()}, según la hora de tu dispositivo.</Text>}
      <Field label="Código de eliminación" value={code} onChangeText={value => { setCode(value); setCodeError(null); }}
        keyboardType="number-pad" maxLength={6} autoComplete="off" textContentType="none" importantForAutofill="no" editable={!state.busy}
        hint="Incluye los seis dígitos, aunque el primero sea cero." error={codeError ?? undefined} />
      <FormButton label="Verificar código" busy={state.busy} onPress={verify} />
      <FormButton label="Solicitar otro código" secondary disabled={state.busy} onPress={() => { resetInputs(); void model.start(); }} />
      <FormButton label="Volver sin eliminar" secondary disabled={state.busy} onPress={() => { resetInputs(); model.cancel(); }} />
    </>}
    {state.stage === "review" && (verification ? <>
      <Text accessibilityRole="header" style={styles.heading}>Revisa lo que ocurrirá</Text>
      <Text style={styles.emphasis}>La eliminación es irreversible.</Text>
      <Text style={styles.text}>Se cerrarán todas tus sesiones y perderás acceso a esta cuenta.</Text>
      <Text style={styles.text}>Se eliminarán o anonimizarán los datos personales que ya no deban conservarse.</Text>
      <Text style={styles.text}>Un registro futuro creará una cuenta nueva, sin recuperar el historial ni los datos eliminados.</Text>
      <Text style={styles.text}>Los registros de pedidos y pagos exigidos por ley permanecerán protegidos y con acceso restringido durante el plazo aplicable.</Text>
      <Text style={styles.text}>Esta solicitud no cancela automáticamente pedidos ni solicita reembolsos.</Text>
      {verification.consequences.retainedCategories.length > 0 && <View style={styles.details}>
        <Text style={styles.heading}>Información que debe conservarse</Text>
        {categories(verification.consequences.retainedCategories).map(category => <Text style={styles.text} key={category}>{category}</Text>)}
        {verification.consequences.retentionPolicy && <>
          <Text style={styles.text}>Motivo: {verification.consequences.retentionPolicy.basis}</Text>
          <Text style={styles.text}>Plazo aplicable: {verification.consequences.retentionPolicy.days} días.</Text>
        </>}
      </View>}
      {verification.consequences.requiresAttention && <FormMessage text={`${reasonText(verification.consequences.reason ?? "")} Puedes confirmar la solicitud; su resultado indicará si se necesita atención adicional.`} />}
      <Text style={styles.muted}>La autorización vence el {new Date(verification.expiresAt).toLocaleString()}, según la hora de tu dispositivo.</Text>
      <Pressable accessibilityRole="checkbox" accessibilityLabel="Comprendo las consecuencias y quiero eliminar mi cuenta"
        accessibilityState={{ checked: confirmed, disabled: state.busy }} disabled={state.busy}
        onPress={() => setConfirmationFor(confirmed ? null : verification)} style={styles.checkbox}>
        <Text style={styles.checkmark}>{confirmed ? "☑" : "☐"}</Text>
        <Text style={styles.checkboxText}>Comprendo las consecuencias y quiero eliminar mi cuenta.</Text>
      </Pressable>
      <FormButton label="Eliminar mi cuenta" busy={state.busy} disabled={!confirmed} onPress={() => { if (!confirmed || state.busy) return; setConfirmationFor(null); void model.confirm(); }} />
      <FormButton label="Volver sin eliminar" secondary disabled={state.busy} onPress={() => { resetInputs(); model.cancel(); }} />
    </> : <FormMessage text="Procesando tu solicitud. Espera mientras confirmamos el resultado." />)}
    {state.stage === "result" && <View style={styles.result} accessibilityLiveRegion="polite">
      <Text accessibilityRole="header" style={styles.heading}>{state.outcomeUnknown || !result ? "Aún no confirmamos el resultado" : RESULT_TITLES[result.status]}</Text>
      <Text style={styles.text}>{resultDescription(result, state.outcomeUnknown)}</Text>
      {(result?.requestId ?? state.requestId) && <Text selectable style={styles.text}>Folio: {result?.requestId ?? state.requestId}</Text>}
      {result && <>
        {result.reason && <FormMessage text={reasonText(result.reason)} />}
        {result.retainedCategories.length > 0 && <View style={styles.details}>
          <Text style={styles.heading}>Registros conservados</Text>
          {categories(result.retainedCategories).map(category => <Text style={styles.text} key={category}>{category}</Text>)}
          {result.retention && <>
            <Text style={styles.text}>Motivo: {result.retention.basis}</Text>
            <Text style={styles.text}>{result.retention.identifiersExpired ? "Se completó la eliminación de los identificadores que estaban sujetos a conservación." : `Conservación hasta: ${new Date(result.retention.until).toLocaleDateString()}.`}</Text>
          </>}
        </View>}
        {result.notification === "sent" && <Text style={styles.muted}>La notificación del resultado fue enviada por correo.</Text>}
        {result.notification === "pending" && <Text style={styles.muted}>La notificación por correo está pendiente. Puedes consultar el estado aquí.</Text>}
        {result.notification === "unavailable" && <Text style={styles.muted}>No pudimos enviar la notificación por correo. Conserva el folio y consulta el estado aquí.</Text>}
      </>}
      {state.receiptUnavailable && <>
        <Text style={styles.text}>Este comprobante ya no está disponible. Cerrar el seguimiento no cancela una solicitud ni acredita la eliminación. Contacta a soporte para conocer el resultado.</Text>
        <FormButton label="Cerrar este seguimiento" secondary disabled={state.busy} onPress={() => { resetInputs(); void model.discardUnavailableReceipt(); }} />
      </>}
      {state.hasReceipt ? <>
        <Text style={styles.muted}>El comprobante permite consultar el resultado desde este dispositivo. Conserva también el folio para solicitar ayuda.</Text>
        {completed ? <FormButton label="Volver al inicio" onPress={() => router.replace("/catalog")} /> : <FormButton label="Consultar estado" busy={state.busy} onPress={() => { void model.refreshResult(); }} />}
        {unconfirmed && <FormButton label="Iniciar una nueva solicitud" secondary disabled={state.busy} onPress={() => { resetInputs(); void model.restartUnconfirmed(); }} />}
      </> : <Text style={styles.text}>No encontramos el comprobante de seguimiento. Contacta al equipo de atención para conocer el resultado.</Text>}
    </View>}
    <Text selectable style={styles.muted}>¿Necesitas ayuda? {SUPPORT_EMAIL}</Text>
    <FormButton label="Aviso de privacidad y ayuda" secondary onPress={() => router.push("/privacy")} />
  </Form>;
}

const styles = StyleSheet.create({
  step: { color: colors.secondary, fontSize: fontSize.sm, fontWeight: "600" },
  heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700" },
  text: { color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  emphasis: { color: colors.text, fontSize: fontSize.md, fontWeight: "700" },
  details: { gap: spacing.sm, borderRadius: radius.sm, padding: spacing.md, backgroundColor: colors.lightBg },
  result: { gap: spacing.md },
  checkbox: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md, paddingVertical: spacing.sm },
  checkmark: { fontSize: fontSize.xl, color: colors.secondary },
  checkboxText: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
});
