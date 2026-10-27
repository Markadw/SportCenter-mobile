import { useState, type PropsWithChildren } from "react";
import {
  ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, type TextInputProps, View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, fontSize, radius, spacing } from "../../../constants/theme";

export function Form({ title, description, children }: PropsWithChildren<{ title: string; description: string }>) {
  return (
    <SafeAreaView style={styles.flex} edges={["bottom", "left", "right"]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scroll}>
          <View style={styles.content}>
            <Text accessibilityRole="header" style={styles.title}>{title}</Text>
            <Text style={styles.description}>{description}</Text>
            {children}
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

interface FieldProps extends TextInputProps { label: string; error?: string; hint?: string }

export function Field({ label, error, hint, secureTextEntry = false, ...props }: FieldProps) {
  const [passwordVisible, setPasswordVisible] = useState(false);
  return (
    <View style={styles.field}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>{label}</Text>
        {secureTextEntry && (
          <Pressable accessibilityRole="button"
            accessibilityLabel={(passwordVisible ? "Ocultar: " : "Mostrar: ") + label}
            onPress={() => setPasswordVisible((visible) => !visible)}
            style={({ pressed }) => [styles.visibilityButton, pressed && styles.dimmed]}>
            <Text style={styles.visibilityLabel}>{passwordVisible ? "Ocultar" : "Mostrar"}</Text>
          </Pressable>
        )}
      </View>
      <TextInput
        autoCorrect={false}
        autoCapitalize="none"
        placeholderTextColor={colors.textMuted}
        selectionColor={colors.primary}
        {...props}
        secureTextEntry={secureTextEntry && !passwordVisible}
        accessibilityLabel={label}
        accessibilityHint={error ?? hint}
        style={[styles.input, !!error && styles.invalid, props.style]}
      />
      {hint && <Text style={styles.hint}>{hint}</Text>}
      {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    </View>
  );
}

export function FormMessage({ text, error = false }: { text: string | null; error?: boolean }) {
  if (!text) return null;
  return <Text accessibilityRole={error ? "alert" : undefined} accessibilityLiveRegion="polite"
    style={[styles.message, error && styles.error]}>{text}</Text>;
}

export function FormButton({ label, onPress, disabled = false, busy = false, secondary = false }: {
  label: string; onPress: () => void; disabled?: boolean; busy?: boolean; secondary?: boolean;
}) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy} onPress={onPress}
      style={({ pressed }) => [styles.button, secondary && styles.secondary, (pressed || disabled || busy) && styles.dimmed]}>
      {busy && <ActivityIndicator color={secondary ? colors.primary : colors.white} />}
      <Text style={[styles.buttonLabel, secondary && styles.secondaryLabel]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.white },
  scroll: { flexGrow: 1, padding: spacing.xl },
  content: { width: "100%", maxWidth: 480, alignSelf: "center", gap: spacing.md },
  title: { fontSize: fontSize.xxl, fontWeight: "700", color: colors.text },
  description: { fontSize: fontSize.md, lineHeight: 23, color: colors.textMuted, marginBottom: spacing.sm },
  field: { gap: spacing.xs },
  labelRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing.sm },
  label: { flexShrink: 1, fontSize: fontSize.md, color: colors.text, fontWeight: "600" },
  visibilityButton: { minHeight: 44, minWidth: 72, paddingHorizontal: spacing.sm, justifyContent: "center", alignItems: "center" },
  visibilityLabel: { color: colors.secondary, fontSize: fontSize.sm, fontWeight: "600" },
  input: { minHeight: 48, borderWidth: 1, borderColor: colors.neutral, borderRadius: radius.sm,
    paddingHorizontal: spacing.md, paddingVertical: spacing.md, fontSize: fontSize.md, color: colors.text, backgroundColor: colors.white },
  invalid: { borderColor: "#B91C1C" },
  hint: { fontSize: fontSize.sm, color: colors.textMuted, lineHeight: 19 },
  error: { color: "#B91C1C", fontSize: fontSize.sm, lineHeight: 20 },
  message: { color: colors.secondary, backgroundColor: colors.lightBg, padding: spacing.md, borderRadius: radius.sm,
    fontSize: fontSize.md, lineHeight: 23 },
  button: { minHeight: 48, padding: spacing.md, borderRadius: radius.sm, backgroundColor: colors.primary,
    justifyContent: "center", alignItems: "center", flexDirection: "row", gap: spacing.sm },
  secondary: { backgroundColor: colors.brandChipBg },
  buttonLabel: { fontSize: fontSize.md, fontWeight: "600", color: colors.white, textAlign: "center" },
  secondaryLabel: { color: colors.secondary },
  dimmed: { opacity: 0.6 },
});
