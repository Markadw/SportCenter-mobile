import { Link, useLocalSearchParams } from "expo-router";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { ScreenState } from "../../../components/ScreenState";
import { useSession } from "../../auth/context/SessionContext";
import { FormButton, FormMessage, Field } from "../../registration/components/Form";
import { OrderState } from "../../orders/components/OrderState";
import { date } from "../../orders/presentation";
import { useReviewsViewModel } from "../hooks/useReviewsViewModel";
export function ReviewsScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>(), id = typeof params.id === "string" ? params.id : "";
  const auth = useSession(), { session } = auth;
  if ("isRestoring" in auth && auth.isRestoring === true) return <ScreenState appearance="storefront" title="Restaurando sesión" loading />;
  return <ReviewsContent key={id + ":" + (session?.sessionId ?? "guest")} id={id} accessToken={session?.accessToken} sessionId={session?.sessionId} />;
}
function ReviewsContent({ id, accessToken, sessionId }: { id: string; accessToken?: string; sessionId?: string }) {
  const model = useReviewsViewModel(id, accessToken, sessionId);
  if (!model.valid) return <ScreenState appearance="storefront" title="Producto no disponible" message="Revisa el identificador del producto." />;
  if (!model.resource.data) return <OrderState {...model.resource} />;
  const eligibility = model.eligibility;
  return <SafeAreaView style={styles.root} edges={["bottom", "left", "right"]}>
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === "ios" ? "padding" : "height"}>
    <FlatList data={model.reviews} keyExtractor={item => String(item.id)} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}
      ListHeaderComponent={<View style={styles.section}>
        <Text accessibilityRole="header" style={styles.title}>Reseñas del producto</Text>
        <View style={styles.summary}>
        <Text style={styles.summaryLabel}>Calificación general</Text>
        <Text style={styles.summaryRating}>{model.resource.data.average.toFixed(1)} de 5 · {model.resource.data.total} {model.resource.data.total === 1 ? "reseña" : "reseñas"}</Text>
        <FormButton label="Actualizar reseñas" onPress={model.resource.retry} disabled={model.publication.pending || model.report.pending} secondary />
        </View>
        <Text style={styles.muted}>{model.preferences.persistent ? "Ocultar autores afecta sólo la vista en este dispositivo. Se guardan IDs de autores en almacenamiento seguro, separados por cuenta; puedes restaurarlos." : "En web, ocultar autores afecta sólo esta vista y se mantiene en memoria hasta recargar."} No modifica reseñas ni cuentas del servidor.</Text>
        {model.preferences.loading && <Text style={styles.muted}>Cargando preferencias de autores…</Text>}
        <FormMessage text={model.preferences.error} error /><FormMessage text={model.preferences.notice} />
        {!!model.preferences.error && <FormButton label="Cargar preferencias de autores" onPress={model.preferences.retry} disabled={model.preferences.saving} secondary />}
        {!!model.blockedCount && <Text style={styles.muted}>Ocultas reseñas de {model.blockedCount} {model.blockedCount === 1 ? "autor" : "autores"}. El resumen incluye todas las reseñas.</Text>}
        {(!!model.blockedCount || (!!model.preferences.error && model.preferences.canReset)) && <FormButton label={model.preferences.ready ? "Restaurar todas las reseñas ocultas" : "Restablecer preferencias locales"} onPress={() => { void model.unblockAll(); }} busy={model.preferences.saving} disabled={!model.preferences.canReset} secondary />}
        <FormMessage text={model.receipt ? "Reporte enviado a atención. Folio #" + model.receipt + ". No se ha retirado contenido automáticamente." : null} />
        <FormMessage text={model.published ? "Tu reseña se publicó correctamente." : null} />
        {!accessToken ? <Link href={{ pathname: "/login", params: { returnTo: "/reviews/" + id } }} style={styles.link}>Inicia sesión para comprobar si puedes publicar</Link> : eligibility.status !== "ready" ? <View style={styles.section}>
          <Text style={styles.muted}>{eligibility.status === "loading" ? "Comprobando si puedes publicar…" : "No pudimos comprobar si puedes publicar."}</Text>
          {eligibility.status === "loading" ? <FormButton label="Cancelar comprobación" onPress={eligibility.cancel} secondary /> : <FormButton label="Reintentar comprobación" onPress={eligibility.retry} secondary />}
        </View> : !eligibility.data?.canReview || model.published ? <Text style={styles.muted}>{eligibility.data?.hasReview || model.published ? "Ya publicaste una reseña de este producto." : "Puedes publicar cuando tengas una compra entregada de este producto."}</Text> : <View style={styles.section}>
          <Text style={styles.heading}>Escribe tu reseña</Text>
          <Text style={styles.text}>Calificación</Text>
          <View style={styles.ratings}>{[1, 2, 3, 4, 5].map(rating => <Pressable key={rating} accessibilityRole="button" accessibilityLabel={rating + " de 5 estrellas"} accessibilityState={{ selected: model.form.rating === rating, disabled: model.publication.pending }} disabled={model.publication.pending}
            onPress={() => model.change("rating", rating)} style={[styles.rating, model.form.rating === rating && styles.selected]}>
            <Text style={[styles.ratingText, model.form.rating === rating && styles.selectedText]}>{rating} ★</Text>
          </Pressable>)}</View>
          <FormMessage text={model.errors.rating ?? null} error />
          <Field label="Comentario" value={model.form.comment} onChangeText={value => model.change("comment", value)} error={model.errors.comment} hint="De 10 a 800 caracteres. Describe tu experiencia con el producto." multiline maxLength={800} editable={!model.publication.pending} style={styles.multiline} autoCapitalize="sentences" />
          <Pressable accessibilityRole="checkbox" accessibilityLabel="Acepto los términos de uso de las reseñas" accessibilityState={{ checked: model.acceptedTerms, disabled: model.publication.pending }} disabled={model.publication.pending} onPress={() => model.changeTerms(!model.acceptedTerms)} style={styles.terms}>
            <Text style={styles.check}>{model.acceptedTerms ? "☑" : "☐"}</Text><Text style={styles.termsLabel}>Acepto los términos de uso de las reseñas y me comprometo a publicar contenido respetuoso.</Text>
          </Pressable>
          <Link href="/privacy" style={styles.link}>Leer términos de reseñas y política de privacidad</Link>
          <FormMessage text={model.termsError} error />
          <FormMessage text={model.publication.error ? "No pudimos publicar. Revisa el comentario y actualiza la comprobación de elegibilidad antes de volver a intentarlo." : null} error />
          <FormButton label="Publicar reseña" onPress={model.submit} busy={model.publication.pending} />
          {model.publication.pending && <FormButton label="Cancelar solicitud" onPress={model.publication.cancel} secondary />}
        </View>}
        <Text style={styles.heading}>Opiniones</Text>
      </View>}
      ListEmptyComponent={<Text style={styles.empty}>{model.resource.data.reviews.length ? "No hay reseñas visibles con tu filtro de autores." : "Aún no hay reseñas de este producto."}</Text>}
      renderItem={({ item }) => <View style={styles.card}>
        <View style={styles.reviewHeader}><Text style={styles.author}>{item.author}</Text><Text style={styles.reviewRating}>{item.rating} de 5</Text></View><Text style={styles.muted}>{date(item.date)}</Text><Text style={styles.text}>{item.comment}</Text>
        <View style={styles.actions}><FormButton label={"Reportar reseña " + item.id} onPress={() => model.openReport(item.id)} disabled={model.report.pending} secondary /><FormButton label="Ocultar reseñas de este autor" onPress={() => { void model.blockAuthor(item.id); }} disabled={model.report.pending || !model.preferences.ready || model.preferences.saving} secondary /></View>
        {model.reportId === item.id && <View style={styles.section}>
          <Text style={styles.heading}>Reportar a atención</Text><Text style={styles.muted}>Enviaremos un mensaje al equipo de atención con la referencia de esta reseña. La revisión es manual.</Text>
          <Field label="Tu nombre" value={model.reportForm.name} onChangeText={value => model.changeReport("name", value)} error={model.reportErrors.name} maxLength={100} autoCapitalize="words" editable={!model.report.pending} />
          <Field label="Tu correo" value={model.reportForm.email} onChangeText={value => model.changeReport("email", value)} error={model.reportErrors.email} maxLength={100} keyboardType="email-address" autoComplete="email" editable={!model.report.pending} />
          <Field label="Motivo del reporte" value={model.reportForm.reason} onChangeText={value => model.changeReport("reason", value)} error={model.reportErrors.reason} multiline maxLength={1000} style={styles.multiline} autoCapitalize="sentences" editable={!model.report.pending} />
          <FormMessage text={model.report.error} error /><FormButton label="Enviar reporte a atención" onPress={model.sendReport} busy={model.report.pending} /><FormButton label="Cancelar reporte" onPress={model.closeReport} secondary />
        </View>}
      </View>} />
    </KeyboardAvoidingView>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: storefront.background },
  list: { padding: spacing.lg, gap: spacing.lg, paddingBottom: spacing.xxl },
  section: { gap: spacing.md },
  title: { fontSize: 28, lineHeight: 36, letterSpacing: -0.6, fontWeight: "700", color: colors.text },
  heading: { fontSize: 18, lineHeight: 26, fontWeight: "700", color: colors.text, marginTop: spacing.sm },
  summary: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: storefront.border, gap: spacing.md, marginVertical: spacing.sm },
  summaryLabel: { color: colors.textMuted, fontSize: 13, lineHeight: 20, fontWeight: "600" },
  summaryRating: { fontSize: 22, lineHeight: 31, color: colors.secondary, fontWeight: "700" },
  text: { fontSize: fontSize.md, color: colors.text, lineHeight: 24 },
  muted: { fontSize: 14, color: colors.textMuted, lineHeight: 22 },
  card: { padding: spacing.lg, borderRadius: radius.lg, backgroundColor: colors.white, borderWidth: 1, borderColor: storefront.border, gap: spacing.md },
  reviewHeader: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", alignItems: "center", gap: spacing.sm },
  author: { flexShrink: 1, fontSize: 16, lineHeight: 24, color: colors.text, fontWeight: "700" },
  reviewRating: { paddingHorizontal: spacing.sm, paddingVertical: spacing.xs, borderRadius: radius.sm, backgroundColor: colors.brandChipBg, color: colors.secondary, fontSize: 14, lineHeight: 21, fontWeight: "700" },
  ratings: { flexDirection: "row", flexWrap: "wrap", gap: spacing.sm },
  rating: { minHeight: 48, minWidth: 48, borderRadius: radius.md, backgroundColor: colors.white, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center", padding: spacing.md },
  selected: { backgroundColor: colors.primary, borderColor: colors.primary },
  ratingText: { fontSize: fontSize.md, lineHeight: 23, color: colors.secondary, fontWeight: "700" },
  selectedText: { color: colors.white },
  multiline: { minHeight: 120, textAlignVertical: "top", borderRadius: radius.md },
  link: { minHeight: 48, color: colors.secondary, textDecorationLine: "underline", paddingVertical: spacing.md, fontSize: fontSize.md, lineHeight: 23 },
  terms: { minHeight: 48, flexDirection: "row", alignItems: "center", gap: spacing.md },
  check: { color: colors.primary, fontSize: fontSize.xl },
  termsLabel: { flex: 1, color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  actions: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: storefront.border },
  empty: { color: colors.textMuted, fontSize: 15, lineHeight: 23, padding: spacing.xl, textAlign: "center", borderWidth: 1, borderColor: storefront.border, borderRadius: radius.lg, backgroundColor: colors.white },
});
