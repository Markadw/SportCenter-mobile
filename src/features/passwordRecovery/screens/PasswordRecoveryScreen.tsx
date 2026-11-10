import { Stack, useRouter } from "expo-router";
import { ArrowLeft, ChevronLeft, Eye, EyeOff, KeyRound, LockKeyhole, Mail, MailCheck, RefreshCw, Send, type LucideIcon } from "lucide-react-native";
import { useRef, useState, type ReactNode } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { FormButton, FormMessage } from "../../registration/components/Form";
import { PASSWORD_HELP } from "../../registration/validation";
import { usePasswordRecoveryViewModel } from "../hooks/usePasswordRecoveryViewModel";

export function PasswordRecoveryScreen() {
  const model = usePasswordRecoveryViewModel();
  const router = useRouter();
  const toLogin = () => router.push("/login");
  if (model.stage === "done") return <Shell onBack={() => router.canGoBack() ? router.back() : router.replace("/login")}>
    <Intro icon={KeyRound} title="Contraseña actualizada" description="Tu contraseña se cambió correctamente. Inicia sesión con la nueva contraseña." />
    <Pressable accessibilityRole="link" accessibilityLabel="Ir a iniciar sesión" onPress={toLogin} style={({ pressed }) => [styles.button, pressed && styles.dimmed]}>
      <Text style={styles.buttonLabel}>Ir a iniciar sesión</Text>
    </Pressable>
  </Shell>;
  const errorText = model.error ? (model.stage === "reset" ? "No pudimos cambiar la contraseña. Revisa el código y la nueva contraseña; solicita otro código si venció o agotaste los intentos." : "No pudimos enviar el código. Revisa tu correo, la activación de tu cuenta y tu conexión. Si realizaste varios intentos, espera un minuto.") : null;
  const sendDisabled = model.pending || model.cooldown > 0;
  // Error real y seguro de reset-psw (código o contraseña); si no se reconoce, el mensaje general anterior.
  const issueText = model.issue?.message ?? errorText;
  const currentStep = model.stage === "email" ? 1 : model.step === "code" ? 2 : 3;
  return <Shell onBack={() => router.canGoBack() ? router.back() : router.replace("/login")} disabled={model.pending}>
    <Steps current={currentStep} />
    {model.stage === "email" ? <>
      <Intro icon={KeyRound} title="Recupera tu acceso" description="Ingresa el correo asociado a tu cuenta y te enviaremos un código para recuperar tu contraseña" />
      <View style={styles.field}>
        <Text style={styles.label}>Correo electrónico</Text>
        <View style={[styles.inputBox, !!model.errors.email && styles.invalid]}>
          <Mail size={18} color={colors.textMuted} />
          {/* La etiqueta accesible «Correo» se conserva: la usa la automatización Android. */}
          <TextInput accessibilityLabel="Correo" accessibilityHint={model.errors.email} value={model.form.email} onChangeText={value => model.change("email", value)}
            keyboardType="email-address" autoComplete="email" autoCapitalize="none" autoCorrect={false} maxLength={100} editable={!model.pending}
            placeholder="tu@correo.com" placeholderTextColor={colors.textMuted} returnKeyType="send" onSubmitEditing={model.sendCode} style={styles.input} />
        </View>
        {model.errors.email && <Text accessibilityRole="alert" style={styles.error}>{model.errors.email}</Text>}
      </View>
      <FormMessage text={errorText} error />
      <Pressable accessibilityRole="button" accessibilityLabel="Enviar código" accessibilityState={{ disabled: sendDisabled, busy: model.pending }} disabled={sendDisabled}
        onPress={model.sendCode} style={({ pressed }) => [styles.button, (pressed || sendDisabled) && styles.dimmed]}>
        {model.pending ? <ActivityIndicator color={colors.white} /> : <Send size={18} color={colors.white} />}
        <Text style={styles.buttonLabel}>Enviar código</Text>
      </Pressable>
      {model.cooldown > 0 && <FormMessage text={"Podrás solicitar otro código en " + model.cooldown + " s."} />}
      {model.pending && <FormButton label="Cancelar solicitud" onPress={model.cancel} secondary />}
      <View style={styles.center}>
        <Text style={styles.muted}>¿Ya recibiste un código?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Introducir código de recuperación" disabled={model.pending} onPress={model.resumeWithCode}
          style={({ pressed }) => [styles.linkButton, (pressed || model.pending) && styles.dimmed]}>
          <KeyRound size={16} color={colors.primary} /><Text style={styles.link}>Introducir código de recuperación</Text>
        </Pressable>
      </View>
    </> : model.step === "code" ? <>
      <Intro icon={MailCheck} title="Introduce tu código" description="Escribe el código de 6 dígitos que enviamos a tu correo." />
      <View style={styles.field}>
        <Text style={styles.label}>Correo electrónico</Text>
        <View style={[styles.inputBox, styles.locked]}>
          <Mail size={18} color={colors.textMuted} />
          <TextInput accessibilityLabel="Correo" value={model.form.email} editable={false} style={styles.input} />
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel="Cambiar correo" onPress={model.changeEmail} style={styles.inlineEnd}>
          <Text style={styles.link}>Cambiar correo</Text>
        </Pressable>
      </View>
      <CodeField value={model.form.token} error={model.errors.token} disabled={model.pending}
        onChange={value => model.change("token", value)} onSubmit={model.continueToPassword} />
      <FormMessage text={issueText} error />
      <Pressable accessibilityRole="button" accessibilityLabel="Continuar" disabled={model.pending} onPress={model.continueToPassword}
        style={({ pressed }) => [styles.button, (pressed || model.pending) && styles.dimmed]}>
        <Text style={styles.buttonLabel}>Continuar</Text>
      </Pressable>
      <View style={styles.center}>
        <Text style={styles.muted}>¿No recibiste el código?</Text>
        <Pressable accessibilityRole="button" accessibilityLabel={model.cooldown ? "Reenviar código en " + model.cooldown + " s" : "Reenviar código"}
          accessibilityState={{ disabled: model.pending || model.cooldown > 0, busy: model.pending }} disabled={model.pending || model.cooldown > 0}
          onPress={model.sendCode} style={({ pressed }) => [styles.linkButton, (pressed || model.pending || model.cooldown > 0) && styles.dimmed]}>
          {model.pending ? <ActivityIndicator size="small" color={colors.primary} /> : <RefreshCw size={16} color={colors.primary} />}
          <Text style={styles.link}>{model.cooldown ? "Reenviar código en " + model.cooldown + " s" : "Reenviar código"}</Text>
        </Pressable>
      </View>
      {model.pending && <FormButton label="Cancelar solicitud" onPress={model.cancel} secondary />}
    </> : <>
      <Intro icon={LockKeyhole} title="Crea una nueva contraseña" description="Elige una contraseña segura que no hayas usado en tu cuenta." />
      <PasswordField label="Nueva contraseña" value={model.form.psw} error={model.errors.psw} hint={PASSWORD_HELP} disabled={model.pending}
        onChange={value => model.change("psw", value)} />
      <PasswordField label="Confirmar contraseña" value={model.form.confirmation} error={model.errors.confirmation} disabled={model.pending}
        onChange={value => model.change("confirmation", value)} onSubmit={model.submit} />
      <FormMessage text={issueText} error />
      <Pressable accessibilityRole="button" accessibilityLabel="Actualizar contraseña" accessibilityState={{ disabled: model.pending, busy: model.pending }} disabled={model.pending}
        onPress={model.submit} style={({ pressed }) => [styles.button, (pressed || model.pending) && styles.dimmed]}>
        {model.pending ? <ActivityIndicator color={colors.white} /> : <LockKeyhole size={18} color={colors.white} />}
        <Text style={styles.buttonLabel}>Actualizar contraseña</Text>
      </Pressable>
      {model.pending && <FormButton label="Cancelar solicitud" onPress={model.cancel} secondary />}
      <Pressable accessibilityRole="button" accessibilityLabel="Volver al código" disabled={model.pending} onPress={model.backToCode}
        style={({ pressed }) => [styles.linkButton, styles.selfCenter, (pressed || model.pending) && styles.dimmed]}>
        <ArrowLeft size={16} color={colors.primary} /><Text style={styles.link}>Volver al código</Text>
      </Pressable>
    </>}
    <View style={styles.separator}><View style={styles.line} /><Text style={styles.muted}>o</Text><View style={styles.line} /></View>
    <Pressable accessibilityRole="link" accessibilityLabel="Volver a iniciar sesión" onPress={toLogin} style={({ pressed }) => [styles.secondary, pressed && styles.dimmed]}>
      <ArrowLeft size={18} color={colors.secondary} /><Text style={styles.secondaryLabel}>Volver a iniciar sesión</Text>
    </Pressable>
  </Shell>;
}

function Shell({ onBack, disabled = false, children }: { onBack: () => void; disabled?: boolean; children: ReactNode }) {
  return <SafeAreaView style={styles.flex} edges={["top", "bottom", "left", "right"]}>
    <Stack.Screen options={{ headerShown: false }} />
    <View style={styles.topBar}>
      <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} disabled={disabled} onPress={onBack}
        style={({ pressed }) => [styles.circle, pressed && styles.dimmed]}><ChevronLeft size={24} color={colors.text} /></Pressable>
      <Text accessibilityRole="header" style={styles.topTitle} numberOfLines={1}>Recuperar contraseña</Text>
      <View style={styles.topSpacer} />
    </View>
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
        <View style={styles.content}>{children}</View>
      </ScrollView>
    </KeyboardAvoidingView>
  </SafeAreaView>;
}

function Steps({ current }: { current: number }) {
  return <View style={styles.steps} accessibilityLabel={"Paso " + current + " de 3"} accessible>
    {[1, 2, 3].map(n => <View key={n} style={[styles.stepBar, n <= current && styles.stepBarOn]} />)}
    <Text style={styles.stepText}>Paso {current} de 3</Text>
  </View>;
}

/** Un único campo real (escribir, borrar, pegar, autocompletar) dibujado como seis casillas. */
function CodeField({ value, error, disabled, onChange, onSubmit }: { value: string; error?: string; disabled: boolean; onChange: (v: string) => void; onSubmit: () => void }) {
  const input = useRef<TextInput>(null);
  const [focused, setFocused] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>Código de recuperación</Text>
    <Pressable onPress={() => input.current?.focus()} style={styles.codeRow} accessible={false}>
      {Array.from({ length: 6 }, (_, i) => <View key={i} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden
        style={[styles.cell, !!value[i] && styles.cellFilled, focused && (i === value.length || (i === 5 && value.length === 6)) && styles.cellActive, !!error && styles.invalid]}>
        <Text style={styles.cellText}>{value[i] ?? ""}</Text>
      </View>)}
      <TextInput ref={input} accessibilityLabel="Código de recuperación" accessibilityHint={error} value={value} editable={!disabled}
        keyboardType="number-pad" inputMode="numeric" autoComplete="one-time-code" textContentType="oneTimeCode" caretHidden
        onChangeText={text => onChange(text.replace(/\D/g, "").slice(0, 6))} onFocus={() => setFocused(true)} onBlur={() => setFocused(false)}
        returnKeyType="done" onSubmitEditing={onSubmit} style={styles.codeInput} />
    </Pressable>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </View>;
}

function PasswordField({ label, value, error, hint, disabled, onChange, onSubmit }: { label: string; value: string; error?: string; hint?: string; disabled: boolean; onChange: (v: string) => void; onSubmit?: () => void }) {
  const [visible, setVisible] = useState(false);
  return <View style={styles.field}>
    <Text style={styles.label}>{label}</Text>
    <View style={[styles.inputBox, !!error && styles.invalid]}>
      <LockKeyhole size={18} color={colors.textMuted} />
      <TextInput accessibilityLabel={label} accessibilityHint={error ?? hint} value={value} onChangeText={onChange} editable={!disabled}
        secureTextEntry={!visible} autoComplete="new-password" textContentType="newPassword" autoCapitalize="none" autoCorrect={false}
        returnKeyType={onSubmit ? "done" : "next"} onSubmitEditing={onSubmit} style={styles.input} />
      <Pressable accessibilityRole="button" accessibilityLabel={(visible ? "Ocultar: " : "Mostrar: ") + label} onPress={() => setVisible(v => !v)} hitSlop={4} style={styles.eye}>
        {visible ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
      </Pressable>
    </View>
    {hint && <Text style={styles.hint}>{hint}</Text>}
    {error && error !== hint && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {error && error === hint && <Text accessibilityRole="alert" style={styles.error}>La contraseña no cumple los requisitos.</Text>}
  </View>;
}

function Intro({ icon: Icon, title, description }: { icon: LucideIcon; title: string; description: string }) {
  return <View style={styles.intro}>
    <View style={styles.introIcon}><Icon size={30} color={colors.primary} /></View>
    <Text style={styles.title}>{title}</Text>
    <Text style={styles.description}>{description}</Text>
  </View>;
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
  input: { flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontSize: fontSize.md, color: colors.text },
  invalid: { borderColor: "#B91C1C" },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 21 },
  button: { minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center", marginTop: spacing.xs },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "700" },
  center: { alignItems: "center", gap: 2 },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  linkButton: { flexDirection: "row", alignItems: "center", gap: spacing.xs, minHeight: 44, paddingHorizontal: spacing.sm },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },
  separator: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: storefront.border },
  secondary: { flexDirection: "row", gap: spacing.sm, minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center" },
  secondaryLabel: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
  locked: { backgroundColor: storefront.background },
  inlineEnd: { alignSelf: "flex-end", minHeight: 40, justifyContent: "center" },
  selfCenter: { alignSelf: "center" },
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center", marginRight: -spacing.sm },
  hint: { color: colors.textMuted, fontSize: fontSize.sm, lineHeight: 19 },
  steps: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  stepBar: { flex: 1, height: 4, borderRadius: radius.pill, backgroundColor: storefront.border },
  stepBarOn: { backgroundColor: colors.primary },
  stepText: { marginLeft: spacing.sm, color: colors.textMuted, fontSize: fontSize.xs, fontWeight: "600" },
  codeRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.sm },
  cell: { flex: 1, maxWidth: 52, height: 52, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.md, alignItems: "center", justifyContent: "center", backgroundColor: colors.white },
  cellFilled: { borderColor: colors.secondary },
  cellActive: { borderColor: colors.primary, borderWidth: 2 },
  cellText: { fontSize: 22, fontWeight: "700", color: colors.text },
  // El campo real cubre las casillas para recibir toques, pegado y autocompletado sin mostrarse.
  codeInput: { ...StyleSheet.absoluteFill, color: "transparent", backgroundColor: "transparent", fontSize: 1, opacity: 0.02 },
});
