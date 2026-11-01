import { ActivityIndicator, View } from "react-native";
import { ScreenState } from "../../../components/ScreenState";
import { FormButton } from "../../registration/components/Form";
import { colors, spacing } from "../../../constants/theme";
export function OrderState({ status, error, retry, cancel }: { status: string; error: string | null; retry: () => void; cancel: () => void }) {
  if (status === "loading") return <View style={{ flex: 1, padding: spacing.xl, backgroundColor: colors.white, justifyContent: "center", gap: spacing.lg }}>
    <ActivityIndicator accessibilityLabel="Cargando información" color={colors.primary} size="large" /><FormButton label="Cancelar carga" onPress={cancel} secondary />
  </View>;
  return <ScreenState title={status === "cancelled" ? "Carga cancelada" : "No se pudo cargar"} message={error ?? undefined} action={status === "cancelled" ? "Reanudar" : "Reintentar"} onAction={retry} />;
}
