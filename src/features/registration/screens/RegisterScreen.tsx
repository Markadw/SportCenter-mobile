import { Stack, useRouter } from "expo-router";
import { Check, ChevronLeft, Eye, EyeOff, LockKeyhole, Mail, Phone, User, UserPlus, type LucideIcon } from "lucide-react-native";
import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, type TextInputProps, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { FormMessage } from "../components/Form";
import { useRegisterViewModel } from "../hooks/useRegisterViewModel";
import { PASSWORD_HELP } from "../validation";

interface RegisterFieldProps extends TextInputProps { label: string; icon: LucideIcon; error?: string; hint?: string }

/** Campo con icono; conserva las etiquetas y la semántica accesible del `Field` compartido. */
function RegisterField({ label, icon: Icon, error, hint, secureTextEntry = false, ...props }: RegisterFieldProps) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputBox, !!error && styles.invalid]}>
      <Icon size={18} color={colors.textMuted} />
      <TextInput autoCorrect={false} autoCapitalize="none" placeholderTextColor={colors.textMuted} selectionColor={colors.primary}
        {...props} secureTextEntry={secureTextEntry && !visible} accessibilityLabel={label} accessibilityHint={error ?? hint} style={styles.input} />
      {secureTextEntry && <Pressable accessibilityRole="button" accessibilityLabel={(visible ? "Ocultar: " : "Mostrar: ") + label}
        onPress={() => setVisible(v => !v)} hitSlop={4} style={styles.eye}>
        {visible ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
      </Pressable>}
    </View>
    {hint && <Text style={styles.hint}>{hint}</Text>}
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function Section({ title, children }: PropsWithChildren<{ title: string }>) {
  return <View style={styles.section}><Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>{children}</View>;
}

export function RegisterScreen() {
  const vm = useRegisterViewModel();
  const router = useRouter();
  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} disabled={vm.pending}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/login")} style={({ pressed }) => [styles.circle, pressed && styles.dimmed]}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.topTitle} numberOfLines={1}>Crear cuenta</Text>
        <View style={styles.topSpacer} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <View style={styles.intro}>
              <View style={styles.introIcon}><UserPlus size={28} color={colors.primary} /></View>
              <Text style={styles.title}>Únete a Sport Center</Text>
              <Text style={styles.description}>Completa tus datos para crear y verificar tu cuenta</Text>
            </View>

            <Section title="Datos personales">
              <RegisterField label="Nombre" icon={User} autoCapitalize="words" autoComplete="given-name"
                value={vm.form.nombre} onChangeText={(value) => vm.setField("nombre", value)} error={vm.errors.nombre} editable={!vm.pending} />
              <RegisterField label="Apellido paterno" icon={User} autoCapitalize="words" autoComplete="family-name"
                value={vm.form.aPaterno} onChangeText={(value) => vm.setField("aPaterno", value)} error={vm.errors.aPaterno} editable={!vm.pending} />
              <RegisterField label="Apellido materno" icon={User} autoCapitalize="words"
                value={vm.form.aMaterno} onChangeText={(value) => vm.setField("aMaterno", value)} error={vm.errors.aMaterno} editable={!vm.pending} />
            </Section>

            <Section title="Información de contacto">
              <RegisterField label="Correo electrónico" icon={Mail} keyboardType="email-address" autoComplete="email"
                value={vm.form.email} onChangeText={(value) => vm.setField("email", value)} error={vm.errors.email} editable={!vm.pending} />
              <RegisterField label="Teléfono" icon={Phone} keyboardType="phone-pad" autoComplete="tel-national" hint="10 dígitos, sin espacios ni prefijo de país."
                value={vm.form.telefono} onChangeText={(value) => vm.setField("telefono", value)} error={vm.errors.telefono} editable={!vm.pending} />
            </Section>

            <Section title="Seguridad de la cuenta">
              <RegisterField label="Contraseña" icon={LockKeyhole} secureTextEntry autoComplete="new-password" hint={PASSWORD_HELP}
                value={vm.form.passw} onChangeText={(value) => vm.setField("passw", value)} error={vm.errors.passw} editable={!vm.pending} />
              <RegisterField label="Confirmar contraseña" icon={LockKeyhole} secureTextEntry autoComplete="new-password"
                value={vm.form.confirmPassword} onChangeText={(value) => vm.setField("confirmPassword", value)} error={vm.errors.confirmPassword}
                editable={!vm.pending} returnKeyType="done" onSubmitEditing={() => void vm.submit()} />
            </Section>

            <View style={styles.consent}>
              <View style={styles.consentRow}>
                {/* La casilla es su propio control; los enlaces del texto no la marcan ni desmarcan. */}
                <Pressable accessibilityRole="checkbox"
                  accessibilityLabel="Acepto el tratamiento necesario para mi cuenta"
                  accessibilityState={{ checked: vm.necessaryProcessingAccepted, disabled: vm.pending }}
                  accessibilityHint="Obligatorio para registrarte. No autoriza mensajes de marketing."
                  disabled={vm.pending} onPress={() => vm.setNecessaryProcessingAccepted(!vm.necessaryProcessingAccepted)} style={styles.checkbox}>
                  <View style={[styles.box, vm.necessaryProcessingAccepted && styles.checked]}>
                    {vm.necessaryProcessingAccepted && <Check size={16} color={colors.white} />}
                  </View>
                </Pressable>
                <Text style={styles.consentLabel}>
                  Acepto los{" "}
                  <Text accessibilityRole="link" style={styles.legalLink} onPress={() => router.push("/legal/terms")}>Términos y condiciones</Text>
                  {" "}y el tratamiento de mis datos necesario para crear mi cuenta, conforme a la{" "}
                  <Text accessibilityRole="link" style={styles.legalLink} onPress={() => router.push("/legal/privacy")}>Política de privacidad</Text>.
                </Text>
              </View>
              <Text style={styles.hint}>Esta aceptación no incluye autorización de marketing.</Text>
              <FormMessage text={vm.consentError} error />
            </View>

            <FormMessage text={vm.error} error />
            {/* Sólo junto a un error: el registro pudo crearse sin respuesta (timeout) o la cuenta ya existe sin verificar. */}
            {!!vm.error && <Pressable accessibilityRole="button" accessibilityLabel="Ya tengo un código" disabled={vm.pending}
              onPress={vm.resumeVerification} style={styles.inlineLink}><Text style={styles.link}>Ya tengo un código</Text></Pressable>}
            <Pressable accessibilityRole="button" accessibilityLabel="Crear cuenta" accessibilityState={{ disabled: vm.pending, busy: vm.pending }}
              disabled={vm.pending} onPress={() => void vm.submit()} style={({ pressed }) => [styles.button, (pressed || vm.pending) && styles.dimmed]}>
              {vm.pending ? <ActivityIndicator color={colors.white} /> : <UserPlus size={18} color={colors.white} />}
              <Text style={styles.buttonLabel}>Crear cuenta</Text>
            </Pressable>
            <View style={styles.login}>
              <Text style={styles.muted}>¿Ya tienes cuenta?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Inicia sesión" disabled={vm.pending}
                onPress={() => router.replace("/login")} style={styles.inlineLink}><Text style={styles.link}>Inicia sesión</Text></Pressable>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  topBar: { flexDirection: "row", alignItems: "center", gap: spacing.md, paddingHorizontal: spacing.lg, paddingVertical: spacing.sm },
  // 44 px visibles + hitSlop de 2 px = 48 px táctiles.
  circle: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border },
  topTitle: { flex: 1, textAlign: "center", fontSize: 17, fontWeight: "700", color: colors.text },
  topSpacer: { width: 44 },
  scroll: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingBottom: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.md },
  intro: { alignItems: "center", gap: spacing.xs, marginTop: spacing.sm },
  introIcon: { width: 60, height: 60, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  title: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: "700", color: colors.text, textAlign: "center" },
  description: { fontSize: fontSize.md, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  section: { gap: spacing.sm, paddingTop: spacing.sm },
  sectionTitle: { fontSize: fontSize.md, fontWeight: "700", color: colors.text },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, paddingLeft: spacing.md, borderWidth: 1, borderColor: storefront.border,
    borderRadius: radius.md, backgroundColor: colors.white },
  input: { flex: 1, minWidth: 0, height: 48, paddingVertical: 0, paddingRight: spacing.md, fontSize: fontSize.md, color: colors.text },
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  invalid: { borderColor: "#B91C1C" },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 21 },
  consent: { gap: spacing.xs, marginTop: spacing.sm },
  consentRow: { flexDirection: "row", alignItems: "flex-start", gap: spacing.xs },
  checkbox: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginLeft: -10, marginTop: -10 },
  box: { width: 24, height: 24, borderWidth: 2, borderColor: colors.textMuted, borderRadius: 6, alignItems: "center", justifyContent: "center" },
  checked: { backgroundColor: colors.primary, borderColor: colors.primary },
  consentLabel: { flex: 1, color: colors.text, fontSize: fontSize.sm, lineHeight: 21 },
  legalLink: { color: colors.primary, fontWeight: "700", textDecorationLine: "underline" },
  button: { minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", marginTop: spacing.sm },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "700" },
  login: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  inlineLink: { minHeight: 44, justifyContent: "center", alignSelf: "center", paddingHorizontal: spacing.xs },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  dimmed: { opacity: 0.6 },
});
