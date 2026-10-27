import { Redirect, useRouter } from "expo-router";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";
import { useLoginViewModel } from "../hooks/useLoginViewModel";

export function LoginScreen() {
  const vm = useLoginViewModel();
  const router = useRouter();
  if (vm.session) return <Redirect href="/account" />;

  return (
    <SafeAreaView style={styles.flex} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>Iniciar sesión</Text>
            <Text style={styles.description}>Accede a tu cuenta de Sport Center.</Text>
            {vm.notice && <Text accessibilityRole="alert" style={styles.message}>{vm.notice}</Text>}

            <View style={styles.field}>
              <Text style={styles.label}>Correo electrónico</Text>
              <TextInput accessibilityLabel="Correo electrónico" accessibilityHint={vm.errors.email}
                autoCapitalize="none" autoCorrect={false} autoComplete="username"
                keyboardType="email-address" textContentType="username" maxLength={100}
                editable={!vm.pending} value={vm.values.email}
                onChangeText={(value) => vm.change("email", value)}
                style={[styles.input, !!vm.errors.email && styles.invalid]} />
              {vm.errors.email && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.email}</Text>}
            </View>

            <View style={styles.field}>
              <View style={styles.labelRow}>
                <Text style={styles.label}>Contraseña</Text>
                <Pressable accessibilityRole="button"
                  accessibilityLabel={vm.passwordVisible ? "Ocultar contraseña" : "Mostrar contraseña"}
                  onPress={vm.togglePassword} style={styles.visibility}>
                  <Text style={styles.link}>{vm.passwordVisible ? "Ocultar" : "Mostrar"}</Text>
                </Pressable>
              </View>
              <TextInput accessibilityLabel="Contraseña" accessibilityHint={vm.errors.passw}
                autoCapitalize="none" autoCorrect={false} autoComplete="current-password"
                textContentType="password" secureTextEntry={!vm.passwordVisible}
                editable={!vm.pending} value={vm.values.passw} returnKeyType="go"
                onChangeText={(value) => vm.change("passw", value)} onSubmitEditing={() => void vm.submit()}
                style={[styles.input, !!vm.errors.passw && styles.invalid]} />
              {vm.errors.passw && <Text accessibilityRole="alert" style={styles.error}>{vm.errors.passw}</Text>}
            </View>

            {vm.error && <Text accessibilityRole="alert" accessibilityLiveRegion="polite"
              style={[styles.message, styles.error]}>{vm.error}</Text>}
            <Pressable accessibilityRole="button" accessibilityLabel="Iniciar sesión"
              accessibilityState={{ disabled: vm.pending, busy: vm.pending }} disabled={vm.pending}
              onPress={() => void vm.submit()}
              style={({ pressed }) => [styles.button, (pressed || vm.pending) && styles.dimmed]}>
              {vm.pending && <ActivityIndicator color={colors.white} />}
              <Text style={styles.buttonLabel}>{vm.pending ? "Ingresando…" : "Iniciar sesión"}</Text>
            </Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Crear cuenta"
              disabled={vm.pending} onPress={() => router.replace("/register")} style={styles.guest}>
              <Text style={styles.link}>Crear cuenta</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => router.replace("/catalog")} style={styles.guest}>
              <Text style={styles.link}>Continuar sin iniciar sesión</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, padding: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  description: { fontSize: fontSize.md, color: colors.textMuted, marginBottom: spacing.sm },
  field: { gap: spacing.xs },
  label: { fontSize: fontSize.md, color: colors.text, fontWeight: "600" },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.neutral, borderRadius: radius.sm,
    padding: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.white },
  invalid: { borderColor: "#B91C1C" },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 21 },
  message: { padding: spacing.md, backgroundColor: colors.lightBg, borderRadius: radius.sm,
    color: colors.text, fontSize: fontSize.md, lineHeight: 23 },
  visibility: { minHeight: 44, minWidth: 72, alignItems: "center", justifyContent: "center" },
  link: { color: colors.secondary, fontWeight: "600" },
  button: { minHeight: 48, backgroundColor: colors.primary, borderRadius: radius.sm, padding: spacing.md,
    flexDirection: "row", gap: spacing.sm, alignItems: "center", justifyContent: "center" },
  buttonLabel: { color: colors.white, fontSize: fontSize.md, fontWeight: "600" },
  guest: { minHeight: 48, alignItems: "center", justifyContent: "center" },
  dimmed: { opacity: 0.6 },
});
