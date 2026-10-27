import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { AppHeader } from "../components/AppHeader";
import { colors } from "../constants/theme";
import { SessionProvider, useSession } from "../features/auth/context/SessionContext";
import { BannersProvider } from "../features/banners";
import { FiltersProvider } from "../features/catalog";
import { ProductsProvider } from "../features/products";

function Navigation() {
  const { session } = useSession();
  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{
        headerShown: true,
        headerStyle: { backgroundColor: colors.primary },
        headerTintColor: colors.white,
        headerTitle: () => <AppHeader />,
        headerTitleAlign: "left",
        contentStyle: { backgroundColor: colors.white },
      }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="catalog" options={{ headerShown: false }} />
        <Stack.Screen name="product/[id]" options={{ headerShown: false }} />
        <Stack.Screen name="login" options={{ title: "Iniciar sesión", headerTitle: "Iniciar sesión" }} />
        <Stack.Protected guard={session !== null}>
          <Stack.Screen name="account" options={{ title: "Mi cuenta", headerTitle: "Mi cuenta" }} />
        </Stack.Protected>
      </Stack>
    </>
  );
}

export default function RootLayout() {
  return (
    <SessionProvider>
      <ProductsProvider>
        <BannersProvider>
          <FiltersProvider>
            <Navigation />
          </FiltersProvider>
        </BannersProvider>
      </ProductsProvider>
    </SessionProvider>
  );
}
