import { useEffect, useRef } from "react";
import { useLocalSearchParams } from "expo-router";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { Field, FormButton, FormMessage } from "../../registration/components/Form";
import { PRIVACY_LINKS, REVIEW_RULES, SUPPORT_EMAIL } from "../config";
import { usePrivacyViewModel } from "../hooks/usePrivacyViewModel";
type Section = "reviews" | "deletion";
export function PrivacyScreen() {
  const model = usePrivacyViewModel(), params = useLocalSearchParams<{ section?: string | string[] }>();
  const section = typeof params.section === "string" ? params.section : "";
  const scroll = useRef<ScrollView>(null), offsets = useRef<Partial<Record<Section, number>>>({});
  function jump(target: Section) { const y = offsets.current[target]; if (y !== undefined) scroll.current?.scrollTo({ y, animated: true }); }
  useEffect(() => { if (section === "reviews" || section === "deletion") { const y = offsets.current[section]; if (y !== undefined) scroll.current?.scrollTo({ y, animated: false }); } }, [section]);
  function measure(target: Section, y: number) { offsets.current[target] = y; if (section === target) scroll.current?.scrollTo({ y, animated: false }); }
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView ref={scroll} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.content}>
          <Text accessibilityRole="header" style={styles.title}>Privacidad y términos</Text>
          <Text style={styles.text}>Sport Center usa tus datos para gestionar tu cuenta, autenticarte, atender tus solicitudes y procesar las funciones de compra que utilices.</Text>
          <Text style={styles.muted}>El responsable indicado para esta app es Sport Center. Esta pantalla describe su funcionamiento y facilita las referencias web existentes. El domicilio del responsable sigue pendiente de confirmación y los documentos web deben unificar sus datos de contacto.</Text>
          <FormButton label="Ir a reglas de reseñas" onPress={() => jump("reviews")} secondary />
          <FormButton label="Ir a solicitud de eliminación" onPress={() => jump("deletion")} secondary />
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>Documentos web existentes</Text>
            <Text style={styles.muted}>Los documentos publicados contienen contactos distintos del soporte indicado para esta app. Se muestran como referencia existente, pendiente de actualización para la app.</Text>
            <FormButton label="Abrir aviso de privacidad del sitio" onPress={() => model.openLegal("privacy")} disabled={model.opening} secondary />
            <Text selectable style={styles.url}>{PRIVACY_LINKS.privacy}</Text>
            <FormButton label="Abrir términos y condiciones del sitio" onPress={() => model.openLegal("terms")} disabled={model.opening} secondary />
            <Text selectable style={styles.url}>{PRIVACY_LINKS.terms}</Text>
          </View>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>Datos y sesión en este dispositivo</Text>
            <Text style={styles.text}>La cuenta utiliza nombre, apellidos, correo y teléfono. Las direcciones, pedidos, pagos y reseñas se usan al acceder a esas funciones. El proveedor de pagos gestiona los datos de pago en su propio flujo.</Text>
            <Text style={styles.text}>En iOS y Android se conserva una credencial de renovación y un identificador de sesión en el almacenamiento seguro del dispositivo para restaurar la sesión. La credencial de acceso se mantiene en memoria. En la versión web la sesión se mantiene en memoria.</Text>
            <Text style={styles.text}>Las preferencias para ocultar reseñas guardan únicamente una versión y los IDs de los autores en almacenamiento seguro en iOS y Android, separados por cuenta o como invitado. Se pueden restaurar. En web permanecen sólo en memoria y no cambian datos del servidor.</Text>
            <Text style={styles.text}>No se guardan contraseñas ni códigos de verificación o recuperación en el almacenamiento local. Cerrar sesión termina el acceso de este dispositivo; solicitar la eliminación de la cuenta es un trámite distinto.</Text>
            <Text style={styles.muted}>La aceptación del tratamiento necesario para la cuenta no incluye autorización de marketing. Esta pantalla no modifica preferencias publicitarias del servidor.</Text>
          </View>
          <View style={styles.section} onLayout={event => measure("reviews", event.nativeEvent.layout.y)}>
            <Text accessibilityRole="header" style={styles.heading}>Reglas para publicar reseñas</Text>
            <Text style={styles.text}>{REVIEW_RULES}</Text>
            <Text style={styles.text}>Para publicar debes aceptar estas reglas de forma explícita, elegir entre 1 y 5 estrellas y escribir un comentario de 10 a 800 caracteres. La elegibilidad se comprueba con la compra entregada registrada en tu cuenta.</Text>
            <Text style={styles.muted}>Un reporte se envía al equipo de atención. El folio confirma la recepción del mensaje; no significa que la reseña se haya retirado ni que un autor haya sido suspendido.</Text>
          </View>
          <View style={styles.section}>
            <Text accessibilityRole="header" style={styles.heading}>Contacto y derechos sobre tus datos</Text>
            <Text style={styles.text}>Responsable: Sport Center. Para soporte de la app, consultas sobre acceso, rectificación, cancelación u oposición, revocación del consentimiento o seguimiento de solicitudes:</Text>
            <Text selectable style={styles.contact}>{SUPPORT_EMAIL}</Text>
            <FormButton label="Abrir contacto del sitio" onPress={() => model.openLegal("contact")} disabled={model.opening} secondary />
            <Text selectable style={styles.url}>{PRIVACY_LINKS.contact}</Text>
            <FormMessage text={model.linkError} error />
          </View>
          <View style={styles.section} onLayout={event => measure("deletion", event.nativeEvent.layout.y)}>
            <Text accessibilityRole="header" style={styles.heading}>Solicitar eliminación de cuenta y datos</Text>
            <Text style={styles.text}>Envía la solicitud al equipo de atención sin necesidad de iniciar sesión. El equipo debe validar la identidad y tramitarla manualmente. El folio sólo confirma que se registró el mensaje; tu cuenta y datos no se eliminan automáticamente.</Text>
            <Text style={styles.muted}>El equipo debe aclararte qué datos se eliminan y si corresponde conservar alguno. No se comunica aquí un plazo de retención o resolución que no esté confirmado.</Text>
            <Text style={styles.muted}>No envíes identificaciones, contraseñas ni códigos. Si se requiere validar tu identidad, solicita un canal adecuado a soporte.</Text>
            <FormMessage text={model.receiptId ? "Solicitud recibida. Folio #" + model.receiptId + ". Tu cuenta aún no está eliminada. Conserva el folio y contacta a " + SUPPORT_EMAIL + " para darle seguimiento." : null} />
            <Field label="Nombre para la solicitud" value={model.form.name} onChangeText={value => model.change("name", value)} error={model.errors.name} maxLength={100} autoCapitalize="words" editable={!model.pending && !model.opening} />
            <Field label="Correo de la cuenta que deseas eliminar" value={model.form.email} onChangeText={value => model.change("email", value)} error={model.errors.email} maxLength={100} keyboardType="email-address" autoComplete="email" editable={!model.pending && !model.opening} />
            <Field label="Información adicional (opcional)" value={model.form.details} onChangeText={value => model.change("details", value)} error={model.errors.details} multiline maxLength={1000} autoCapitalize="sentences" editable={!model.pending && !model.opening} style={styles.multiline} />
            <Pressable accessibilityRole="checkbox" accessibilityLabel="Confirmo que solicito eliminar mi cuenta y sus datos asociados" accessibilityState={{ checked: model.form.confirmed, disabled: model.pending || model.opening }}
              disabled={model.pending || model.opening} onPress={() => model.change("confirmed", !model.form.confirmed)} style={styles.confirm}>
              <Text style={styles.check}>{model.form.confirmed ? "☑" : "☐"}</Text><Text style={styles.confirmLabel}>Confirmo que solicito eliminar mi cuenta y sus datos asociados, mediante revisión manual de atención.</Text>
            </Pressable>
            <FormMessage text={model.errors.confirmed ?? null} error />
            <FormMessage text={model.error} error />
            <FormMessage text={model.notice} />
            <FormButton label="Enviar solicitud de eliminación" onPress={model.submit} busy={model.pending} disabled={model.opening} />
            {model.pending && <FormButton label="Cancelar espera de respuesta" onPress={model.cancel} secondary />}
            <FormButton label="Preparar correo a soporte como alternativa" onPress={model.prepareEmail} busy={model.opening} disabled={model.pending} secondary />
            <Text style={styles.muted}>La alternativa abre tu aplicación de correo con los datos anteriores. Debes revisar y enviar el mensaje; no genera un folio en esta pantalla.</Text>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.white }, scroll: { flexGrow: 1, padding: spacing.xl },
  content: { width: "100%", maxWidth: 560, alignSelf: "center", gap: spacing.lg }, section: { gap: spacing.md, paddingTop: spacing.lg },
  title: { color: colors.text, fontSize: fontSize.xxl, fontWeight: "700" }, heading: { color: colors.text, fontSize: fontSize.lg, fontWeight: "700" },
  text: { color: colors.text, fontSize: fontSize.md, lineHeight: 23 }, muted: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 20 },
  url: { color: colors.secondary, fontSize: fontSize.sm, lineHeight: 20 }, contact: { color: colors.primary, fontSize: fontSize.md, fontWeight: "600" },
  multiline: { minHeight: 100, textAlignVertical: "top" }, confirm: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md, borderRadius: radius.sm },
  check: { color: colors.primary, fontSize: fontSize.xl }, confirmLabel: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
});
