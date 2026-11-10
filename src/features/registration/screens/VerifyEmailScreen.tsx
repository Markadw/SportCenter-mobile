import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, ChevronLeft, Mail, MailCheck, RefreshCw } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { FormMessage } from "../components/Form";
import { useVerificationViewModel } from "../hooks/useVerificationViewModel";

const CODE_LENGTH = 6;

export function VerifyEmailScreen() {
  const params = useLocalSearchParams<{ email?: string | string[] }>();
  const router = useRouter();
  // Un correo recibido por ruta (registro o «Ya tengo un código») es el de la cuenta: se muestra sólo lectura.
  const routeEmail = typeof params.email === "string" ? params.email : "";
  const vm = useVerificationViewModel(routeEmail);
  const lockedEmail = !!vm.form.email && !!routeEmail;
  const codeInput = useRef<TextInput>(null);
  const [codeFocused, setCodeFocused] = useState(false);
  const back = () => router.canGoBack() ? router.back() : router.replace("/login");

  if (vm.verified) {
    return <Screen onBack={back}>
      <Intro icon={<CheckCircle2 size={32} color={colors.primary} />} title="Cuenta verificada"
        description="Tu correo quedó confirmado. Ya puedes iniciar sesión en Sport Center." />
      <PrimaryButton label="Iniciar sesión" onPress={() => router.replace("/login")} />
      <Pressable accessibilityRole="button" accessibilityLabel="Volver a la tienda" onPress={() => router.replace("/")}
        style={({ pressed }) => [styles.secondary, pressed && styles.dimmed]}><Text style={styles.secondaryLabel}>Volver a la tienda</Text></Pressable>
    </Screen>;
  }

  const code = vm.form.token;
  return <Screen onBack={back} disabled={!!vm.pending}>
    <Intro icon={<MailCheck size={32} color={colors.primary} />} title="Verifica tu correo"
      description="Introduce el código de 6 dígitos que enviamos a tu correo." />

    <View style={styles.field}>
      <Text style={styles.label}>Correo electrónico</Text>
      <View style={[styles.inputBox, lockedEmail && styles.locked, !!vm.errors.email && styles.invalid]}>
        <Mail size={18} color={colors.textMuted} />
        <TextInput accessibilityLabel="Correo electrónico" accessibilityHint={vm.errors.email ?? (lockedEmail ? "Correo de tu registro" : undefined)}
          keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false}
          editable={!lockedEmail && !vm.pending} value={vm.form.email} placeholder="tu@correo.com" placeholderTextColor={colors.textMuted}
          onChangeText={(value) => vm.setField("email", value)} style={styles.input} />
      </View>
      {lockedEmail && <Text style={styles.hint}>Correo con el que creaste tu cuenta.</Text>}
      {vm.errors.email && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.email}</Text>}
    </View>

    <View style={styles.field}>
      <Text style={styles.label}>Código de verificación</Text>
      {/* Un único campo real (teclado numérico, pegado y autocompletado) dibujado como seis casillas. */}
      <Pressable onPress={() => codeInput.current?.focus()} style={styles.codeRow} accessible={false}>
        {Array.from({ length: CODE_LENGTH }, (_, i) => {
          const active = codeFocused && (i === code.length || (i === CODE_LENGTH - 1 && code.length === CODE_LENGTH));
          return <View key={i} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
            style={[styles.cell, !!code[i] && styles.cellFilled, active && styles.cellActive, !!vm.errors.token && styles.invalid]}>
            <Text style={styles.cellText}>{code[i] ?? ""}</Text>
          </View>;
        })}
        <TextInput ref={codeInput} accessibilityLabel="Código de verificación" accessibilityHint={vm.errors.token}
          keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode"
          editable={!vm.pending} value={code} caretHidden
          onChangeText={(value) => vm.setField("token", value.replace(/\D/g, "").slice(0, CODE_LENGTH))}
          onFocus={() => setCodeFocused(true)} onBlur={() => setCodeFocused(false)}
          returnKeyType="done" onSubmitEditing={() => void vm.verify()} style={styles.codeInput} />
      </Pressable>
      {vm.errors.token && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.token}</Text>}
      {/* Reglas del backend: 24 h de vigencia y 3 intentos por código; reenviar genera uno nuevo. */}
      <Text style={styles.rules}>El código vence en 24 horas y permite 3 intentos.</Text>
    </View>

    <FormMessage text={vm.error} error />
    <FormMessage text={vm.notice} />
    <PrimaryButton label="Verificar cuenta" busy={vm.pending === "verify"} disabled={!!vm.pending} onPress={() => void vm.verify()} />
    <View style={styles.resend}>
      <Text style={styles.muted}>¿No recibiste el código?</Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Reenviar código" accessibilityState={{ disabled: !!vm.pending, busy: vm.pending === "resend" }}
        disabled={!!vm.pending} onPress={() => void vm.resend()} style={({ pressed }) => [styles.resendButton, (pressed || !!vm.pending) && styles.dimmed]}>
        {vm.pending === "resend" ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={16} color={colors.primary} />}
        <Text style={styles.link}>Reenviar código</Text>
      </Pressable>
    </View>
  </Screen>;
}

function Screen({ onBack, disabled = false, children }: { onBack: () => void; disabled?: boolean; children: ReactNode }) {
  return <SafeAreaView style={styles.flex} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} disabled={disabled} onPress={onBack}
        style={({ pressed }) => [styles.circle, pressed && styles.dimmed]}><ChevronLeft size={24} color={colors.text} /></Pressable>
      <Text accessibilityRole="header" style={styles.topTitle} numberOfLines={1}>Verificar correo</Text>
      <View style={styles.topSpacer} />
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Intro({ icon, title, description }: { icon: ReactNode; title: string; description: string }) {
  return <View style={styles.intro}>
    <View style={styles.introIcon}>{icon}</View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>;
}

function PrimaryButton({ label, onPress, busy = false, disabled = false }: { label: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} accessibilityState={{ disabled: disabled || busy, busy }}
    disabled={disabled || busy} onPress={onPress} style={({ pressed }) => [styles.button, (pressed || disabled || busy) && styles.dimmed]}>
    {busy ? <ActivityIndicator color={colors.white} /> : <CheckCircle2 size={18} color={colors.white} />}
    <Text style={styles.buttonLabel}>{label}</Text>
  </Pressable>;
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
  intro: { alignItems: "center", gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.sm },
  introIcon: { width: 68, height: 68, borderRadius: radius.pill, backgroundColor: colors.brandChipBg, alignItems: "center", justifyContent: "center", marginBottom: spacing.xs },
  title: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: "700", color: colors.text, textAlign: "center" },
  description: { fontSize: fontSize.md, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, paddingHorizontal: spacing.md, borderWidth: 1,
    borderColor: storefront.border, borderRadius: radius.md, backgroundColor: colors.white },
  locked: { backgroundColor: storefront.background },
  input: { flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontSize: fontSize.md, color: colors.text },
  codeRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  cell: { flex: 1, maxWidth: 52, height: 52, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  cellFilled: { borderColor: colors.secondary },
  cellActive: { borderColor: colors.primary, borderWidth: 2 },
  cellText: { fontSize: 22, fontWeight: "700", color: colors.text },
  // El campo real cubre las casillas para recibir toques, pegado y autocompletado sin mostrarse.
  codeInput: { ...StyleSheet.absoluteFill, color: "transparent", backgroundColor: "transparent", fontSize: 1, opacity: 0.02 },
  invalid: { borderColor: "#B91C1C" },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 21 },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  rules: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19, textAlign: "center", marginTop: spacing.xs },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  button: { minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "700" },
  secondary: { minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
  resend: { alignItems: "center", gap: 2 },
  resendButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },
  dimmed: { opacity: 0.6 },
});
