import { Redirect, Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ArrowRight, ChevronLeft, Eye, EyeOff, LockKeyhole, LogIn, Mail } from "lucide-react-native";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing, storefront } from "../../../constants/theme";
import { useLoginViewModel } from "../hooks/useLoginViewModel";
import { useSession } from "../context/SessionContext";
import { ScreenState } from "../../../components/ScreenState";
import { resolveLoginReturnTo } from "../navigation/loginReturnTo";

export function LoginScreen() {
  const vm = useLoginViewModel();
  const router = useRouter();
  const { isRestoring } = useSession();
  const { returnTo } = useLocalSearchParams<{ returnTo?: string | string[] }>();
  const destination = resolveLoginReturnTo(returnTo);
  if (isRestoring) return <ScreenState title="Restaurando sesión" loading />;
  if (vm.session) return <Redirect href={destination} />;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom", "left", "right"]}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={styles.topBar}>
        <Pressable accessibilityRole="button" accessibilityLabel="Volver" hitSlop={2} disabled={vm.pending}
          onPress={() => router.canGoBack() ? router.back() : router.replace("/")} style={({ pressed }) => [styles.circle, pressed && styles.dimmed]}>
          <ChevronLeft size={24} color={colors.text} />
        </Pressable>
        <Text accessibilityRole="header" style={styles.topTitle} numberOfLines={1}>Iniciar sesión</Text>
        <View style={styles.topSpacer} />
      </View>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <View style={styles.intro}>
              <Text style={styles.title}>Bienvenido de nuevo</Text>
              <Text style={styles.description}>Accede a tu cuenta de Sport Center.</Text>
            </View>
            {vm.notice && <Text accessibilityRole="alert" style={styles.message}>{vm.notice}</Text>}

            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico</Text>
              <View style={[styles.inputBox, !!vm.errors.email && styles.invalid]}>
                <Mail size={18} color={colors.textMuted} />
                <TextInput accessibilityLabel="Correo electrónico" accessibilityHint={vm.errors.email}
                  autoCapitalize="none" autoCorrect={false} autoComplete="username"
                  keyboardType="email-address" textContentType="username" maxLength={100}
                  editable={!vm.pending} value={vm.values.email} placeholder="tu@correo.com" placeholderTextColor={colors.textMuted}
                  onChangeText={(value) => vm.change("email", value)} style={styles.input} />
              </View>
              {vm.errors.email && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.email}</Text>}
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>Contraseña</Text>
              <View style={[styles.inputBox, !!vm.errors.passw && styles.invalid]}>
                <LockKeyhole size={18} color={colors.textMuted} />
                <TextInput accessibilityLabel="Contraseña" accessibilityHint={vm.errors.passw}
                  autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
                  textContentType="password" secureTextEntry={!vm.passwordVisible}
                  editable={!vm.pending} value={vm.values.passw} returnKeyType="go"
                  onChangeText={(value) => vm.change("passw", value)} onSubmitEditing={() => void vm.submit()} style={styles.input} />
                <Pressable accessibilityRole="button" accessibilityLabel={vm.passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onPress={vm.togglePassword} hitSlop={4} style={styles.eye}>
                  {vm.passwordVisible ? <EyeOff size={20} color={colors.textMuted} /> : <Eye size={20} color={colors.textMuted} />}
                </Pressable>
              </View>
              {vm.errors.passw && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.passw}</Text>}
              <Pressable accessibilityRole="link" accessibilityLabel="¿Olvidaste tu contraseña?"
                disabled={vm.pending} onPress={() => router.push("/forgot-password")} style={styles.forgot}>
                <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
              </Pressable>
            </View>

            {vm.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
              style={[styles.message, styles.error]}>{vm.error}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel="Iniciar sesión"
              accessibilityState={{ disabled: vm.pending, busy: vm.pending }} disabled={vm.pending}
              onPress={() => void vm.submit()}
              style={({ pressed }) => [styles.button, (pressed || vm.pending) && styles.dimmed]}>
              {vm.pending ? <ActivityIndicator color={colors.white} /> : <LogIn size={18} color={colors.white} />}
              <Text style={styles.buttonLabel}>{vm.pending ? "Ingresando…" : "Iniciar sesión"}</Text>
            </Pressable>

            <View style={styles.register}>
              <Text style={styles.muted}>¿No tienes cuenta?</Text>
              <Pressable accessibilityRole="button" accessibilityLabel="Regístrate"
                disabled={vm.pending} onPress={() => router.replace("/register")} style={styles.inlineLink}>
                <Text style={styles.link}>Regístrate</Text>
              </Pressable>
            </View>
            <View style={styles.separator}>
              <View style={styles.line} /><Text style={styles.muted}>o</Text><View style={styles.line} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel="Continuar sin iniciar sesión" onPress={() => router.replace("/catalog")}
              style={({ pressed }) => [styles.guest, pressed && styles.dimmed]}>
              <Text style={styles.guestLabel}>Continuar sin iniciar sesión</Text>
              <ArrowRight size={18} color={colors.secondary} />
            </Pressable>
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
  intro: { alignItems: "center", gap: spacing.xs, marginTop: spacing.md, marginBottom: spacing.sm },
  title: { fontSize: fontSize.xl, lineHeight: 28, fontWeight: "700", color: colors.text, textAlign: "center" },
  description: { fontSize: fontSize.md, lineHeight: 22, color: colors.textMuted, textAlign: "center" },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.sm, color: colors.text, fontWeight: "600" },
  inputBox: { flexDirection: "row", alignItems: "center", gap: spacing.sm, height: 48, paddingLeft: spacing.md, borderWidth: 1, borderColor: storefront.border,
    borderRadius: radius.md, backgroundColor: colors.white },
  input: { flex: 1, minWidth: 0, height: 48, paddingVertical: 0, fontSize: fontSize.md, color: colors.text },
  eye: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
  invalid: { borderColor: "#B91C1C" },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 21 },
  message: { padding: spacing.md, borderWidth: 1, borderColor: storefront.border, borderRadius: radius.md,
    color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  forgot: { alignSelf: "flex-end", minHeight: 44, justifyContent: "center" },
  link: { color: colors.primary, fontSize: fontSize.sm, fontWeight: "700" },
  muted: { color: colors.textMuted, fontSize: fontSize.sm },
  button: { minHeight: 52, backgroundColor: colors.primary, borderRadius: radius.pill, paddingHorizontal: spacing.lg,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "700" },
  register: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: spacing.xs },
  inlineLink: { minHeight: 44, justifyContent: "center", paddingHorizontal: spacing.xs },
  separator: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  line: { flex: 1, height: 1, backgroundColor: storefront.border },
  guest: { flexDirection: "row", gap: spacing.sm, minHeight: 52, borderRadius: radius.pill, borderWidth: 1, borderColor: storefront.border, alignItems: "center", justifyContent: "center" },
  guestLabel: { color: colors.secondary, fontSize: fontSize.md, fontWeight: "600" },
  dimmed: { opacity: 0.6 },
});
