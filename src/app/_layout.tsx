import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useCallback } from "react";
import { View } from "react-native";
import { colors } from "../constants/theme";
import { SessionProvider, useSession } from "../features/auth/context/SessionContext";
import { FiltersProvider } from "../features/catalog";
import { ProductsProvider, useProducts } from "../features/products";
import { StartupGate } from "../features/startup/StartupGate";

void SplashScreen.preventAutoHideAsync().catch(() => {});

function Navigation() {
  const { isLoading } = useProducts();
  const { isRestoring } = useSession();
  const onLayout = useCallback(() => { void SplashScreen.hideAsync().catch(() => {}); }, []);
  return <View style={{ flex: 1 }} onLayout={onLayout}>
    <StatusBar style="dark" />
    <StartupGate loading={isLoading || isRestoring}>
      <Stack screenOptions={{ headerStyle: { backgroundColor: colors.white }, headerTintColor: colors.text,
        headerShadowVisible: false, contentStyle: { backgroundColor: colors.white } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ title: "Detalle del producto" }} />
        <Stack.Screen name="register" options={{ title: "Crear cuenta" }} />
        <Stack.Screen name="verify-email" options={{ title: "Verificar correo" }} />
        <Stack.Screen name="login" options={{ title: "Iniciar sesión" }} />
        <Stack.Screen name="forgot-password" options={{ title: "Recuperar contraseña" }} />
        <Stack.Screen name="profile" options={{ title: "Mi perfil" }} />
        <Stack.Screen name="orders/index" options={{ title: "Mis pedidos" }} />
        <Stack.Screen name="orders/[id]" options={{ title: "Detalle del pedido" }} />
        <Stack.Screen name="reviews/[id]" options={{ title: "Reseñas del producto" }} />
        <Stack.Screen name="privacy" options={{ title: "Privacidad y términos" }} />
      </Stack>
    </StartupGate>
  </View>;
}
export default function RootLayout() {
  return <SessionProvider><ProductsProvider><FiltersProvider>
    <Navigation />
  </FiltersProvider></ProductsProvider></SessionProvider>;
}
